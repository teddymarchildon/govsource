-- Readiness follows each evidence packet, not unrelated records in a source run.
alter table public.brief_source_change add column error_kind text check(error_kind in ('temporary','waiting','review'));
alter table public.brief_job add column development_date date;

create function public.brief_development_date(metadata jsonb) returns date
language sql immutable security invoker set search_path='' as $$
 select nullif(left(coalesce(metadata->>'law_enacted_date',metadata->'actions'->0->>'date',
 metadata->>'publication_date',metadata->>'date_filed',metadata->>'introduced_date'),10),'')::date;
$$;
update public.brief_job set development_date=public.brief_development_date(source_metadata);
create index brief_job_current_queue on public.brief_job(development_date,priority desc,created_at)
 where status in ('pending','retry','processing');

create function public.brief_source_ready(p_type text,p_id bigint) returns boolean
language sql stable security invoker set search_path='' as $$
 select case when p_type='bill' then coalesce((select
 not coalesce((to_jsonb(b)->>'sync_pending')::boolean,false)
 and not (coalesce(to_jsonb(b)->'sync_missing_fields','[]'::jsonb) ?| array['actions','texts'])
 from public.bill b where b.id=p_id),false) else true end;
$$;
revoke all on function public.brief_source_ready(text,bigint),public.brief_development_date(jsonb) from public,anon,authenticated;
grant execute on function public.brief_source_ready(text,bigint),public.brief_development_date(jsonb) to service_role;

-- Added completeness flags do not change the evidence in previously queued bills.
update public.brief_job set source_metadata=source_metadata || jsonb_build_object('sync_pending',false,'sync_missing_fields','[]'::jsonb)
 where source_type='bill';


create or replace function public.track_brief_source_change() returns trigger language plpgsql security invoker set search_path = '' as $$
declare r jsonb; t text; i bigint;
begin
 if TG_OP='UPDATE' and (to_jsonb(new)-array['id','created_at','updated_at']) = (to_jsonb(old)-array['id','created_at','updated_at']) then return new; end if;
 r := case when TG_OP='DELETE' then to_jsonb(old) else to_jsonb(new) end;
 t := case when TG_TABLE_NAME in ('bill','bill_text','bill_action','bill_summary') then 'bill' when TG_TABLE_NAME='court_opinion' then 'cluster' else TG_TABLE_NAME end;
 i := case when TG_TABLE_NAME in ('bill_text','bill_action') then (r->>'bill_id')::bigint when TG_TABLE_NAME='bill_summary' then (r->>'bill')::bigint when TG_TABLE_NAME='court_opinion' then (r->>'cluster_id')::bigint else (r->>'id')::bigint end;
 if i is not null then
 insert into public.brief_source_change(item_type,item_id) values(t,i)
 on conflict(item_type,item_id) do update set revision=brief_source_change.revision+1,changed_at=now(),next_attempt_at=now(),attempts=0,error=null,error_kind=null;
 end if;
 return case when TG_OP='DELETE' then old else new end;
end $$;

create or replace function public.enqueue_brief_job(p_type text,p_id bigint,p_revision bigint,p_fingerprint text,p_development text,p_item_type text,p_metadata jsonb,p_evidence jsonb,p_priority integer) returns bigint language plpgsql security invoker set search_path='' as $$
declare c public.brief_source_change; j bigint; s text;
begin
 s:=case p_type when 'bill' then 'congress' when 'cluster' then 'courtlistener' else 'federal_register' end;
 perform 1 where public.brief_source_ready(p_type,p_id);
 if not found then raise exception 'Source sync is incomplete'; end if;
 select * into c from public.brief_source_change where item_type=p_type and item_id=p_id for update;
 if c.revision is distinct from p_revision or public.brief_source_bundle(p_type,p_id) is distinct from p_metadata then raise exception 'Source changed during extraction'; end if;
 insert into public.brief_job(source_type,item_type,item_id,source_revision,fingerprint,development_key,source_metadata,evidence,priority,development_date)
 values(p_type,p_item_type,p_id,p_revision,p_fingerprint,p_development,p_metadata,p_evidence,p_priority,public.brief_development_date(p_metadata))
 on conflict(source_type,item_id,fingerprint) do nothing returning id into j;
 -- Unchanged content after a harmless refresh keeps the job and advances its revision.
 if j is null then
 update public.brief_job set source_revision=p_revision where source_type=p_type and item_id=p_id and fingerprint=p_fingerprint returning id into j;
 end if;
 update public.brief_job set status='superseded',lease_token=null,lease_until=null,updated_at=now()
 where source_type=p_type and item_id=p_id and fingerprint<>p_fingerprint and status in ('pending','retry','processing','verified');
 update public.brief_job job set target_brief_id=b.id,target_version=b.version from public.brief b
 where job.id=j and job.status='pending' and b.primary_item_id=p_id
 and b.generation_metadata->>'development_key'=p_development
 and b.generation_metadata->>'pipeline'='continuous-v1';
 update public.brief_source_change set processed_revision=p_revision,error=null,attempts=0,error_kind=null where item_type=p_type and item_id=p_id;
 return j;
end $$;

create or replace function public.publish_verified_brief(p_job bigint) returns bigint language plpgsql security invoker set search_path='' as $$
declare j public.brief_job; a public.brief_attempt; c public.brief_source_change; cfg public.brief_pipeline_settings; result bigint; s text; d jsonb;
begin
 select * into cfg from public.brief_pipeline_settings where id for update;
 select * into j from public.brief_job where id=p_job for update;
 if j.status='published' then return j.brief_id; end if;
 if not cfg.publication_enabled or j.status<>'verified' then return null; end if;
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

create or replace function public.pending_brief_source_changes(p_limit integer default 100) returns setof public.brief_source_change language sql stable security invoker set search_path='' as $$
 select c.* from public.brief_source_change c
 where (c.error_kind is null or c.error_kind='temporary') and c.revision>c.processed_revision and c.next_attempt_at<=now() and public.brief_source_ready(c.item_type,c.item_id)
 order by c.changed_at desc,c.item_type,c.item_id limit greatest(1,least(p_limit,1000));
$$;

create or replace function public.publishable_brief_jobs(p_limit integer default 10) returns table(id bigint) language sql stable security invoker set search_path='' as $$
 select j.id from public.brief_job j join public.brief_source_change c on c.item_type=j.source_type and c.item_id=j.item_id

 where j.status='verified' and c.revision=j.source_revision and public.brief_source_ready(j.source_type,j.item_id)
 order by j.priority desc,j.created_at limit greatest(1,least(p_limit,100));
$$;

create or replace function public.brief_pipeline_overview() returns jsonb language sql stable security invoker set search_path='' as $$
 select jsonb_build_object(
 'settings',(select to_jsonb(s) from public.brief_pipeline_settings s where id),
 'sources',(select jsonb_agg(to_jsonb(s) order by source) from public.brief_source_run s),
 'counts',(select coalesce(jsonb_object_agg(status,n),'{}') from (select status,count(*) n from public.brief_job group by status) c),
 'oldest_current_waiting',(select min(created_at) from public.brief_job where status in ('pending','retry','processing') and (development_date is null or development_date >= current_date-30)),
 'current_waiting',(select count(*) from public.brief_job where status in ('pending','retry','processing') and (development_date is null or development_date >= current_date-30)),
 'backfill_waiting',(select count(*) from public.brief_job where status in ('pending','retry','processing') and development_date < current_date-30),
 'last_progress_at',(select max(updated_at) from public.brief_job where attempts>0 and status in ('processing','retry','verified','published','withheld','skipped')),
 'source_error_counts',(select coalesce(jsonb_object_agg(kind,n),'{}') from (select coalesce(error_kind,'temporary') kind,count(*) n from public.brief_source_change where error is not null group by error_kind) e),
 'oldest_waiting',(select min(created_at) from public.brief_job where status in ('pending','retry','processing')),
 'pending_sources',(select count(*) from public.brief_source_change where revision>processed_revision),
 'source_errors',(select coalesce(jsonb_agg(to_jsonb(e)),'[]') from (select item_type,item_id,error,error_kind,attempts,next_attempt_at from public.brief_source_change where error is not null order by changed_at desc limit 20) e),
 'spending',(select jsonb_build_object('accounted_usd',coalesce(sum(coalesce(actual_usd,reserved_usd)),0),'reserved_usd',coalesce(sum(reserved_usd) filter(where actual_usd is null),0),'calls',count(*)) from public.brief_api_call where budget_day=(now() at time zone 'UTC')::date),
 'jobs',(select coalesce(jsonb_agg(to_jsonb(j)),'[]') from (select id,item_type,item_id,source_metadata->>'title' title,source_metadata->>'case_name' case_name,priority,status,reason,last_error,attempts,created_at,updated_at,brief_id from public.brief_job order by updated_at desc,id desc limit 50) j)
 );
$$;

create or replace function public.note_brief_source_refresh(p_type text,p_id bigint) returns void
language plpgsql security invoker set search_path='' as $$
begin
 if p_type not in ('bill','agency_document','cluster') then raise exception 'Invalid source type'; end if;
 insert into public.brief_source_change(item_type,item_id) values(p_type,p_id)
 on conflict(item_type,item_id) do update set revision=brief_source_change.revision+1,
 changed_at=now(),next_attempt_at=now(),error=null,attempts=0,error_kind=null;
end $$;

create or replace function public.claim_brief_job(p_token uuid,p_queue text) returns setof public.brief_job language plpgsql security invoker set search_path='' as $$
begin
 if p_queue not in ('current','backfill') then raise exception 'Invalid brief queue'; end if;
 update public.brief_job set status='withheld',last_error='Worker repeatedly interrupted',lease_token=null,lease_until=null
 where status='processing' and lease_until<now() and attempts>=3;
 return query
 with candidate as (
 select j.id from public.brief_job j join public.brief_source_change c on c.item_type=j.source_type and c.item_id=j.item_id

 where ((j.status in ('pending','retry') and j.next_attempt_at<=now()) or (j.status='processing' and j.lease_until<now()))
 and j.attempts<3 and c.revision=j.source_revision and public.brief_source_ready(j.source_type,j.item_id)
 and case when p_queue='backfill' then j.development_date < current_date-30 else j.development_date is null or j.development_date >= current_date-30 end
 and (p_queue='current' or not exists(select 1 from public.brief_job recent join public.brief_source_change rc on rc.item_type=recent.source_type and rc.item_id=recent.item_id where recent.status in ('pending','retry') and recent.attempts<3 and recent.next_attempt_at<=now() and recent.source_revision=rc.revision and (recent.development_date is null or recent.development_date>=current_date-30) and public.brief_source_ready(recent.source_type,recent.item_id)))
 order by j.priority desc,j.created_at limit 1 for update of j skip locked)
 update public.brief_job j set status='processing',attempts=j.attempts+1,lease_token=p_token,lease_until=now()+interval '25 minutes',updated_at=now()
 from candidate c where j.id=c.id returning j.*;
end $$;

create or replace function public.claim_brief_job(p_token uuid) returns setof public.brief_job
language sql security invoker set search_path='' as $$
 select * from public.claim_brief_job(p_token,'current');
$$;
revoke all on function public.claim_brief_job(uuid,text) from public,anon,authenticated;
grant execute on function public.claim_brief_job(uuid,text) to service_role;

-- Stop retrying conditions that need a source change or explicit review.
update public.brief_source_change set error_kind=case
 when error like '%exceeds processing limit%' or error='Latest bill text version is ambiguous' then 'review'
 when error in ('Bill text has not arrived','Latest legislative action is newer than the stored text; await matching text',
 'Enacted bill is missing its enrolled or law text') then 'waiting'
 else 'temporary' end where error is not null;
