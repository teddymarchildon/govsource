-- Admin requests are private, durable, and share the normal AI budget.
create table public.brief_generation_request (
 id bigint generated always as identity primary key,
 source_type text not null check(source_type in ('bill','agency_document','cluster')),
 item_id bigint not null,
 original_brief_id bigint references public.brief(id),
 requested_by uuid not null,
 created_at timestamptz not null default now(),
 status text not null default 'queued' check(status in ('queued','enqueued','failed')),
 error text
);
alter table public.brief_generation_request enable row level security;
revoke all on public.brief_generation_request from public,anon,authenticated;
grant all on public.brief_generation_request to service_role;
grant usage,select on sequence public.brief_generation_request_id_seq to service_role;
alter table public.brief_job add column manual_request_id bigint unique references public.brief_generation_request(id);
create index brief_generation_request_source on public.brief_generation_request(source_type,item_id,id desc);

create function public.request_brief_generation(p_type text,p_id bigint,p_user uuid,p_brief bigint default null)
returns bigint language plpgsql security invoker set search_path='' as $$
declare r public.brief_generation_request; j public.brief_job; result bigint;
begin
 if p_type not in ('bill','agency_document','cluster') or p_user is null then raise exception 'Invalid generation request'; end if;
 perform pg_advisory_xact_lock(hashtextextended('brief-request:'||p_type||':'||p_id,0));
 if public.brief_source_bundle(p_type,p_id) is null then raise exception 'Source record not found'; end if;
 if p_brief is not null and not exists(select 1 from public.brief where id=p_brief and primary_item_id=p_id
 and case when primary_item_type in ('bill','law') then 'bill' when primary_item_type in ('agency_document','executive_order') then 'agency_document' else primary_item_type end=p_type) then raise exception 'Brief does not match source'; end if;
 select * into r from public.brief_generation_request where source_type=p_type and item_id=p_id order by id desc limit 1;
 if found then
   if r.status='queued' then return r.id; end if;
   select * into j from public.brief_job where manual_request_id=r.id;
   if found and (j.status in ('pending','retry','processing','verified') and (j.brief_id is null or exists(select 1 from public.brief where id=j.brief_id and status in ('draft','review')))) then
     return r.id;
   end if;
 end if;
 insert into public.brief_source_change(item_type,item_id) values(p_type,p_id) on conflict do nothing;
 insert into public.brief_generation_request(source_type,item_id,original_brief_id,requested_by) values(p_type,p_id,p_brief,p_user) returning id into result;
 return result;
end $$;
revoke all on function public.request_brief_generation(text,bigint,uuid,bigint) from public,anon,authenticated;
grant execute on function public.request_brief_generation(text,bigint,uuid,bigint) to service_role;

create function public.enqueue_requested_brief(p_request bigint,p_revision bigint,p_item_type text,p_metadata jsonb,p_evidence jsonb,p_development text)
returns bigint language plpgsql security invoker set search_path='' as $$
declare r public.brief_generation_request; c public.brief_source_change; result bigint;
begin
 select * into r from public.brief_generation_request where id=p_request for update;
 if not found then raise exception 'Request not found'; end if;
 select id into result from public.brief_job where manual_request_id=r.id;
 if found then return result; end if;
 if r.status<>'queued' then raise exception 'Request is not queued'; end if;
 select * into c from public.brief_source_change where item_type=r.source_type and item_id=r.item_id for share;
 if c.revision is distinct from p_revision or public.brief_source_bundle(r.source_type,r.item_id) is distinct from p_metadata then raise exception 'Source changed during extraction'; end if;
 if not public.brief_source_ready(r.source_type,r.item_id) then raise exception 'Source sync is incomplete'; end if;
 insert into public.brief_job(source_type,item_type,item_id,source_revision,fingerprint,development_key,source_metadata,evidence,priority,development_date,manual_request_id)
 values(r.source_type,p_item_type,r.item_id,p_revision,'editor-request-'||r.id,p_development,p_metadata,p_evidence,100,public.brief_development_date(p_metadata),r.id) returning id into result;
 update public.brief_generation_request set status='enqueued',error=null where id=r.id;
 return result;
end $$;
revoke all on function public.enqueue_requested_brief(bigint,bigint,text,jsonb,jsonb,text) from public,anon,authenticated;
grant execute on function public.enqueue_requested_brief(bigint,bigint,text,jsonb,jsonb,text) to service_role;

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
 where manual_request_id is null and source_type=p_type and item_id=p_id and fingerprint<>p_fingerprint and status in ('pending','retry','processing','verified');
 update public.brief_job job set target_brief_id=b.id,target_version=b.version from public.brief b
 where job.id=j and job.status='pending' and b.primary_item_id=p_id
 and b.generation_metadata->>'development_key'=p_development
 and b.generation_metadata->>'pipeline'='continuous-v1';
 update public.brief_source_change set processed_revision=p_revision,error=null,attempts=0,error_kind=null where item_type=p_type and item_id=p_id;
 return j;
end $$;

create or replace function public.claim_brief_job(p_token uuid,p_queue text) returns setof public.brief_job language plpgsql security invoker set search_path='' as $$
begin
 if p_queue not in ('current','backfill') then raise exception 'Invalid brief queue'; end if;
 update public.brief_job set status='withheld',last_error='Worker repeatedly interrupted',lease_token=null,lease_until=null
 where status='processing' and lease_until<now() and attempts>=3;
 update public.brief_job j set status='withheld',reason='Source changed; request a fresh draft',updated_at=now() from public.brief_source_change c where j.manual_request_id is not null and j.brief_id is null and j.status in ('pending','retry','verified') and c.item_type=j.source_type and c.item_id=j.item_id and c.revision<>j.source_revision;
 return query
 with candidate as (
 select j.id from public.brief_job j join public.brief_source_change c on c.item_type=j.source_type and c.item_id=j.item_id

 where j.status in ('pending','retry','processing')
 and public.brief_job_blocker(j,c.revision,public.brief_source_ready(j.source_type,j.item_id)) is null
 and case when p_queue='backfill' then j.manual_request_id is null and j.development_date < current_date-30 else j.manual_request_id is not null or j.development_date is null or j.development_date >= current_date-30 end
 and (p_queue='current' or not exists(select 1 from public.brief_job recent join public.brief_source_change rc on rc.item_type=recent.source_type and rc.item_id=recent.item_id where recent.status in ('pending','retry','processing') and public.brief_job_blocker(recent,rc.revision,public.brief_source_ready(recent.source_type,recent.item_id)) is null and (recent.development_date is null or recent.development_date>=current_date-30)))
 -- Aging adds at most ten points: old routine notices cannot outrank
 -- consequential law, rule and court developments solely because they are old.
 order by (j.manual_request_id is not null) desc, (j.priority + least(10, greatest(0, extract(epoch from (now()-j.created_at))/86400))) desc,
 j.created_at,j.id limit 1 for update of j skip locked)
 update public.brief_job j set status='processing',attempts=j.attempts+1,lease_token=p_token,lease_until=now()+interval '25 minutes',updated_at=now()
 from candidate c where j.id=c.id returning j.*;
end $$;

create or replace function public.stage_verified_brief(p_job bigint) returns bigint language plpgsql security invoker set search_path='' as $$
declare j public.brief_job; a public.brief_attempt; c public.brief_source_change; cfg public.brief_pipeline_settings; result bigint; s text; d jsonb;
begin
 select * into cfg from public.brief_pipeline_settings where id for update;
 select * into j from public.brief_job where id=p_job for update;
 if j.brief_id is not null then return j.brief_id; end if;
 if (not cfg.editorial_review_required and j.manual_request_id is null) or j.status<>'verified' then return null; end if;
 s:=case j.source_type when 'bill' then 'congress' when 'cluster' then 'courtlistener' else 'federal_register' end;
 perform 1 where public.brief_source_ready(j.source_type,j.item_id);
 if not found then return null; end if;
 select * into c from public.brief_source_change where item_type=j.source_type and item_id=j.item_id for share;
 if c.revision is distinct from j.source_revision or public.brief_source_bundle(j.source_type,j.item_id) is distinct from j.source_metadata then return null; end if;
 select * into a from public.brief_attempt where job_id=j.id order by id desc limit 1;
 if not found or not a.passed or a.verification->>'passed'<>'true' or a.verification->>'deterministic_passed'<>'true' then raise exception 'Verified evidence required'; end if;
 -- Older factual-only verification must be screened and written under the new rubric.
 if not public.brief_editorial_quality_passes(a.verification->'editorial_quality') then
   update public.brief_job set status='retry',attempts=0,next_attempt_at=now(),
     reason='Editorial quality re-screen required',updated_at=now() where id=j.id;
   return null;
 end if;
 -- Corrections never overwrite public copy without an editor's intervention.
 if j.target_brief_id is not null then
   update public.brief_job set status='withheld',reason='Correction requires editorial review of the saved verified attempt',updated_at=now() where id=j.id;
   return null;
 end if;
 if j.manual_request_id is null and exists(select 1 from public.brief b where b.primary_item_id=j.item_id
 and b.primary_item_type in (j.item_type,j.source_type)
 and b.generation_metadata->>'development_key'=j.development_key) then
 update public.brief_job set status='withheld',reason='This development already has a brief',updated_at=now() where id=j.id;
 return null;
 end if;
 d:=a.draft;
 insert into public.brief(title,slug,dek,points,context_markdown,primary_item_type,primary_item_id,policy_areas,sources,author_name,status,published_at,auto_generated,generation_metadata)
 values(d->>'title',d->>'slug',d->>'dek',d->'points',nullif(d->>'context_markdown',''),j.item_type,j.item_id,
 array(select jsonb_array_elements_text(d->'policy_areas')),d->'sources','GovSource Briefs','review',null,true,
 jsonb_build_object('pipeline','continuous-v1','job_id',j.id,'attempt_id',a.id,'fingerprint',j.fingerprint,'development_key',j.development_key,'manual_request_id',j.manual_request_id,'original_brief_id',(select original_brief_id from public.brief_generation_request where id=j.manual_request_id),'prompt_version',a.prompt_version,'writer_model',a.writer_model,'verifier_model',a.verifier_model)) returning id into result;
 insert into public.brief_related_item(brief_id,item_type,item_id,relation_role,sort_order)
 select result,b.primary_item_type,b.primary_item_id,'Earlier coverage',0 from public.brief b
 where b.primary_item_id=j.item_id and b.primary_item_type in (j.item_type,j.source_type) and b.id<>result limit 1 on conflict do nothing;
 update public.brief_job set brief_id=result,updated_at=now() where id=j.id;
 return result;
end $$;

create or replace function public.publish_verified_brief(p_job bigint) returns bigint language plpgsql security invoker set search_path='' as $$
declare j public.brief_job; a public.brief_attempt; c public.brief_source_change; cfg public.brief_pipeline_settings; result bigint; s text; d jsonb;
begin
 select * into cfg from public.brief_pipeline_settings where id for update;
 select * into j from public.brief_job where id=p_job for update;
 if j.manual_request_id is not null then return public.stage_verified_brief(p_job); end if;
 if j.status='published' then return j.brief_id; end if;
 if cfg.editorial_review_required or not cfg.publication_enabled or j.status<>'verified' then return null; end if;
 s:=case j.source_type when 'bill' then 'congress' when 'cluster' then 'courtlistener' else 'federal_register' end;
 perform 1 where public.brief_source_ready(j.source_type,j.item_id);
 if not found then return null; end if;
 select * into c from public.brief_source_change where item_type=j.source_type and item_id=j.item_id for share;
 if c.revision is distinct from j.source_revision or public.brief_source_bundle(j.source_type,j.item_id) is distinct from j.source_metadata then return null; end if;
 select * into a from public.brief_attempt where job_id=j.id order by id desc limit 1;
 if not found or not a.passed or a.verification->>'passed'<>'true' or a.verification->>'deterministic_passed'<>'true' then raise exception 'Verified evidence required'; end if;
 -- Older factual-only verification must be screened and written under the new rubric.
 if not public.brief_editorial_quality_passes(a.verification->'editorial_quality') then
   update public.brief_job set status='retry',attempts=0,next_attempt_at=now(),
     reason='Editorial quality re-screen required',updated_at=now() where id=j.id;
   return null;
 end if;
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
 array(select jsonb_array_elements_text(d->'policy_areas')),d->'sources','GovSource Briefs','published',now(),true,
 jsonb_build_object('pipeline','continuous-v1','job_id',j.id,'attempt_id',a.id,'fingerprint',j.fingerprint,'development_key',j.development_key,'prompt_version',a.prompt_version,'writer_model',a.writer_model,'verifier_model',a.verifier_model)) returning id into result;
 insert into public.brief_related_item(brief_id,item_type,item_id,relation_role,sort_order)
 select result,b.primary_item_type,b.primary_item_id,'Earlier coverage',0 from public.brief b
 where b.primary_item_id=j.item_id and b.primary_item_type in (j.item_type,j.source_type) and b.id<>result limit 1 on conflict do nothing;
 update public.brief_job set status='published',brief_id=result,updated_at=now() where id=j.id;
 return result;
end $$;
