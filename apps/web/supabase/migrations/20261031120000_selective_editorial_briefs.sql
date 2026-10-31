-- Favor selective, reviewed explainers while retaining broad source discovery.
alter table public.brief_pipeline_settings
 add column daily_draft_limit integer not null default 5 check (daily_draft_limit between 0 and 100),
 add column editorial_review_required boolean not null default true;
update public.brief_pipeline_settings set publication_enabled=false,
 daily_publication_limit=least(daily_publication_limit,5);

-- The existing settings-row lock serializes reservations across all workers.
-- Screening is uncapped by draft count; every paid call still uses the dollar cap.
create or replace function public.reserve_brief_api_call(p_job bigint,p_model text,p_stage text,p_amount numeric) returns uuid language plpgsql security invoker set search_path='' as $$
declare cfg public.brief_pipeline_settings; used numeric; result uuid; today date := (now() at time zone 'UTC')::date;
begin
 select * into cfg from public.brief_pipeline_settings where id for update;
 if p_amount<=0 or p_amount>cfg.daily_budget_usd then raise exception 'Daily AI budget exhausted'; end if;
 if p_stage <> 'selection'
 and not exists(select 1 from public.brief_api_call where job_id=p_job and budget_day=today and stage<>'selection')
 and (select count(distinct job_id) from public.brief_api_call where budget_day=today and stage<>'selection') >= cfg.daily_draft_limit
 then raise exception 'Daily AI budget exhausted: daily draft limit reached'; end if;
 select coalesce(sum(coalesce(actual_usd,reserved_usd)),0) into used from public.brief_api_call where budget_day=today;
 if used+p_amount>cfg.daily_budget_usd then raise exception 'Daily AI budget exhausted'; end if;
 insert into public.brief_api_call(job_id,model,stage,reserved_usd) values(p_job,p_model,p_stage,p_amount) returning id into result;
 return result;
end $$;

create or replace function public.publish_verified_brief(p_job bigint) returns bigint language plpgsql security invoker set search_path='' as $$
declare j public.brief_job; a public.brief_attempt; c public.brief_source_change; cfg public.brief_pipeline_settings; result bigint; s text; d jsonb;
begin
 select * into cfg from public.brief_pipeline_settings where id for update;
 select * into j from public.brief_job where id=p_job for update;
 if j.status='published' then return j.brief_id; end if;
 if cfg.editorial_review_required or not cfg.publication_enabled or j.status<>'verified' then return null; end if;
 s:=case j.source_type when 'bill' then 'congress' when 'cluster' then 'courtlistener' else 'federal_register' end;
 perform 1 where public.brief_source_ready(j.source_type,j.item_id);
 if not found then return null; end if;
 select * into c from public.brief_source_change where item_type=j.source_type and item_id=j.item_id for share;
 if c.revision is distinct from j.source_revision or public.brief_source_bundle(j.source_type,j.item_id) is distinct from j.source_metadata then return null; end if;
 select * into a from public.brief_attempt where job_id=j.id order by id desc limit 1;
 if not found or not a.passed or a.verification->>'passed'<>'true' or a.verification->>'deterministic_passed'<>'true' then raise exception 'Verified evidence required'; end if;
 if (select count(*) from public.brief_job where status='published' and updated_at >= date_trunc('day',now() at time zone 'UTC') at time zone 'UTC') >= cfg.daily_publication_limit then return null; end if;
 -- A correction can replace only the exact untouched automated version captured at discovery.
 if j.target_brief_id is not null then
   perform 1 from public.brief where id=j.target_brief_id and version=j.target_version and auto_generated and updated_by is null and status='published' for update;
   if not found then
     update public.brief_job set status='withheld',reason='Existing brief was edited; automatic replacement withheld',updated_at=now() where id=j.id;
     return null;
   end if;
   d:=a.draft;
   update public.brief set title=d->>'title',dek=d->>'dek',points=d->'points',context_markdown=nullif(d->>'context_markdown',''),
     sources=d->'sources',policy_areas=array(select jsonb_array_elements_text(d->'policy_areas')),
     generation_metadata=generation_metadata || jsonb_build_object('job_id',j.id,'attempt_id',a.id,'fingerprint',j.fingerprint,'correction',true)
   where id=j.target_brief_id;
   update public.brief_job set status='published',brief_id=j.target_brief_id,updated_at=now() where id=j.id;
   return j.target_brief_id;
 end if;
 if exists(select 1 from public.brief b where b.primary_item_id=j.item_id
 and b.primary_item_type in (j.item_type,j.source_type)
 and b.generation_metadata->>'development_key'=j.development_key) then
 update public.brief_job set status='withheld',reason='This development already has a brief',updated_at=now() where id=j.id;
 return null;
 end if;
 d:=a.draft;
 insert into public.brief(title,slug,dek,points,context_markdown,primary_item_type,primary_item_id,policy_areas,sources,author_name,status,published_at,auto_generated,generation_metadata)
 values(d->>'title',d->>'slug',d->>'dek',d->'points',nullif(d->>'context_markdown',''),j.item_type,j.item_id,
 array(select jsonb_array_elements_text(d->'policy_areas')),d->'sources','GovSource Automated Briefs','published',now(),true,
 jsonb_build_object('pipeline','continuous-v1','job_id',j.id,'attempt_id',a.id,'fingerprint',j.fingerprint,'development_key',j.development_key,'prompt_version',a.prompt_version,'writer_model',a.writer_model,'verifier_model',a.verifier_model)) returning id into result;
 insert into public.brief_related_item(brief_id,item_type,item_id,relation_role,sort_order)
 select result,b.primary_item_type,b.primary_item_id,'Earlier coverage',0 from public.brief b
 where b.primary_item_id=j.item_id and b.primary_item_type in (j.item_type,j.source_type) and b.id<>result limit 1 on conflict do nothing;
 update public.brief_job set status='published',brief_id=result,updated_at=now() where id=j.id;
 return result;
end $$;

create or replace function public.stage_verified_brief(p_job bigint) returns bigint language plpgsql security invoker set search_path='' as $$
declare j public.brief_job; a public.brief_attempt; c public.brief_source_change; cfg public.brief_pipeline_settings; result bigint; s text; d jsonb;
begin
 select * into cfg from public.brief_pipeline_settings where id for update;
 select * into j from public.brief_job where id=p_job for update;
 if j.brief_id is not null then return j.brief_id; end if;
 if not cfg.editorial_review_required or j.status<>'verified' then return null; end if;
 s:=case j.source_type when 'bill' then 'congress' when 'cluster' then 'courtlistener' else 'federal_register' end;
 perform 1 where public.brief_source_ready(j.source_type,j.item_id);
 if not found then return null; end if;
 select * into c from public.brief_source_change where item_type=j.source_type and item_id=j.item_id for share;
 if c.revision is distinct from j.source_revision or public.brief_source_bundle(j.source_type,j.item_id) is distinct from j.source_metadata then return null; end if;
 select * into a from public.brief_attempt where job_id=j.id order by id desc limit 1;
 if not found or not a.passed or a.verification->>'passed'<>'true' or a.verification->>'deterministic_passed'<>'true' then raise exception 'Verified evidence required'; end if;
 -- Corrections never overwrite public copy without an editor's intervention.
 if j.target_brief_id is not null then
   update public.brief_job set status='withheld',reason='Correction requires editorial review of the saved verified attempt',updated_at=now() where id=j.id;
   return null;
 end if;
 if exists(select 1 from public.brief b where b.primary_item_id=j.item_id
 and b.primary_item_type in (j.item_type,j.source_type)
 and b.generation_metadata->>'development_key'=j.development_key) then
 update public.brief_job set status='withheld',reason='This development already has a brief',updated_at=now() where id=j.id;
 return null;
 end if;
 d:=a.draft;
 insert into public.brief(title,slug,dek,points,context_markdown,primary_item_type,primary_item_id,policy_areas,sources,author_name,status,published_at,auto_generated,generation_metadata)
 values(d->>'title',d->>'slug',d->>'dek',d->'points',nullif(d->>'context_markdown',''),j.item_type,j.item_id,
 array(select jsonb_array_elements_text(d->'policy_areas')),d->'sources','GovSource','review',null,true,
 jsonb_build_object('pipeline','continuous-v1','job_id',j.id,'attempt_id',a.id,'fingerprint',j.fingerprint,'development_key',j.development_key,'prompt_version',a.prompt_version,'writer_model',a.writer_model,'verifier_model',a.verifier_model)) returning id into result;
 insert into public.brief_related_item(brief_id,item_type,item_id,relation_role,sort_order)
 select result,b.primary_item_type,b.primary_item_id,'Earlier coverage',0 from public.brief b
 where b.primary_item_id=j.item_id and b.primary_item_type in (j.item_type,j.source_type) and b.id<>result limit 1 on conflict do nothing;
 update public.brief_job set brief_id=result,updated_at=now() where id=j.id;
 return result;
end $$;

revoke all on function public.stage_verified_brief(bigint) from public,anon,authenticated;
grant execute on function public.stage_verified_brief(bigint) to service_role;

create or replace function public.publishable_brief_jobs(p_limit integer default 10) returns table(id bigint) language sql stable security invoker set search_path='' as $$
 select j.id from public.brief_job j join public.brief_source_change c on c.item_type=j.source_type and c.item_id=j.item_id
 where j.status='verified' and j.brief_id is null and c.revision=j.source_revision and public.brief_source_ready(j.source_type,j.item_id)
 order by j.priority desc,j.created_at limit greatest(1,least(p_limit,100));
$$;

-- Prevent current-news starvation without changing eligibility or publication gates.
create or replace function public.claim_brief_job(p_token uuid,p_queue text) returns setof public.brief_job language plpgsql security invoker set search_path='' as $$
begin
 if p_queue not in ('current','backfill') then raise exception 'Invalid brief queue'; end if;
 update public.brief_job set status='withheld',last_error='Worker repeatedly interrupted',lease_token=null,lease_until=null
 where status='processing' and lease_until<now() and attempts>=3;
 return query
 with candidate as (
 select j.id from public.brief_job j join public.brief_source_change c on c.item_type=j.source_type and c.item_id=j.item_id

 where j.status in ('pending','retry','processing')
 and public.brief_job_blocker(j,c.revision,public.brief_source_ready(j.source_type,j.item_id)) is null
 and case when p_queue='backfill' then j.development_date < current_date-30 else j.development_date is null or j.development_date >= current_date-30 end
 and (p_queue='current' or not exists(select 1 from public.brief_job recent join public.brief_source_change rc on rc.item_type=recent.source_type and rc.item_id=recent.item_id where recent.status in ('pending','retry','processing') and public.brief_job_blocker(recent,rc.revision,public.brief_source_ready(recent.source_type,recent.item_id)) is null and (recent.development_date is null or recent.development_date>=current_date-30)))
 -- Aging adds at most ten points: old routine notices cannot outrank
 -- consequential law, rule and court developments solely because they are old.
 order by (j.priority + least(10, greatest(0, extract(epoch from (now()-j.created_at))/86400))) desc,
 j.created_at,j.id limit 1 for update of j skip locked)
 update public.brief_job j set status='processing',attempts=j.attempts+1,lease_token=p_token,lease_until=now()+interval '25 minutes',updated_at=now()
 from candidate c where j.id=c.id returning j.*;
end $$;

