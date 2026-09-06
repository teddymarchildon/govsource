-- Durable source discovery, evidence, verification, budgets and atomic publication.
-- All pipeline state is server-only. Publication starts paused.
create table public.brief_pipeline_settings (
  id boolean primary key default true check (id),
  publication_enabled boolean not null default false,
  daily_publication_limit integer not null default 30 check (daily_publication_limit between 0 and 1000),
  daily_budget_usd numeric(12,6) not null default 5 check (daily_budget_usd between 0 and 1000),
  updated_at timestamptz not null default now()
);
insert into public.brief_pipeline_settings(id) values (true);
create table public.brief_source_run (
  source text primary key check (source in ('congress','federal_register','courtlistener','courtlistener_reference','processor')),
  run_token uuid, started_at timestamptz, lease_until timestamptz,
  finished_at timestamptz, last_success_at timestamptz,
  status text not null default 'idle' check (status in ('idle','running','success','failed')),
  error text, checkpoint jsonb not null default '{}'
);
insert into public.brief_source_run(source) values ('congress'),('federal_register'),('courtlistener'),('courtlistener_reference'),('processor');
create table public.brief_source_change (
  item_type text not null check (item_type in ('bill','agency_document','cluster')),
  item_id bigint not null,
  revision bigint not null default 1,
  changed_at timestamptz not null default now(),
  processed_revision bigint not null default 0,
  next_attempt_at timestamptz not null default now(),
  attempts integer not null default 0,
  error text,
  primary key (item_type,item_id)
);
create index brief_source_change_pending on public.brief_source_change(next_attempt_at,changed_at) where revision > processed_revision;
create table public.brief_job (
  id bigint generated always as identity primary key,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  item_type text not null check (item_type in ('bill','law','agency_document','executive_order','cluster')),
  item_id bigint not null, source_type text not null, source_revision bigint not null,
  fingerprint text not null, development_key text not null,
  source_metadata jsonb not null, evidence jsonb not null,
  priority integer not null default 0 check (priority between 0 and 100),
  reason text not null default '',
  status text not null default 'pending' check (status in ('pending','processing','retry','verified','published','skipped','withheld','superseded')),
  attempts integer not null default 0,
  next_attempt_at timestamptz not null default now(), lease_token uuid, lease_until timestamptz,
  last_error text, brief_id bigint references public.brief(id),
  target_brief_id bigint references public.brief(id), target_version integer,
  unique(source_type,item_id,fingerprint)
);
create index brief_job_queue on public.brief_job(priority desc,created_at) where status in ('pending','retry','processing');
create index brief_job_source on public.brief_job(source_type,item_id,source_revision);
create table public.brief_attempt (
  id bigint generated always as identity primary key,
  job_id bigint not null references public.brief_job(id),
  created_at timestamptz not null default now(),
  draft jsonb not null, verification jsonb not null,
  passed boolean not null, prompt_version text not null,
  writer_model text not null, verifier_model text not null
);
create index brief_attempt_job on public.brief_attempt(job_id,id desc);
create table public.brief_revision (
  id bigint generated always as identity primary key,
  brief_id bigint not null references public.brief(id),
  version integer not null, saved_at timestamptz not null default now(),
  content jsonb not null, unique(brief_id,version)
);
create table public.brief_api_call (
  id uuid primary key default gen_random_uuid(),
  job_id bigint not null references public.brief_job(id),
  created_at timestamptz not null default now(), budget_day date not null default (now() at time zone 'UTC')::date,
  model text not null, stage text not null, reserved_usd numeric(12,6) not null check(reserved_usd > 0),
  actual_usd numeric(12,6) check(actual_usd >= 0), response_id text, usage jsonb,
  status text not null default 'reserved' check(status in ('reserved','completed'))
);
create index brief_api_call_day on public.brief_api_call(budget_day);
create index brief_api_call_job on public.brief_api_call(job_id);

create function public.capture_brief_revision() returns trigger language plpgsql security invoker set search_path = '' as $$
begin
 insert into public.brief_revision(brief_id,version,content) values(old.id,old.version,to_jsonb(old)) on conflict do nothing;
 return new;
end $$;
create trigger capture_brief_revision before update on public.brief for each row execute function public.capture_brief_revision();

create function public.track_brief_source_change() returns trigger language plpgsql security invoker set search_path = '' as $$
declare r jsonb; t text; i bigint;
begin
 if TG_OP='UPDATE' and (to_jsonb(new)-array['id','created_at','updated_at']) = (to_jsonb(old)-array['id','created_at','updated_at']) then return new; end if;
 r := case when TG_OP='DELETE' then to_jsonb(old) else to_jsonb(new) end;
 t := case when TG_TABLE_NAME in ('bill','bill_text','bill_action','bill_summary') then 'bill' when TG_TABLE_NAME='court_opinion' then 'cluster' else TG_TABLE_NAME end;
 i := case when TG_TABLE_NAME in ('bill_text','bill_action') then (r->>'bill_id')::bigint when TG_TABLE_NAME='bill_summary' then (r->>'bill')::bigint when TG_TABLE_NAME='court_opinion' then (r->>'cluster_id')::bigint else (r->>'id')::bigint end;
 if i is not null then
 insert into public.brief_source_change(item_type,item_id) values(t,i)
 on conflict(item_type,item_id) do update set revision=brief_source_change.revision+1,changed_at=now(),next_attempt_at=now(),attempts=0,error=null;
 end if;
 return case when TG_OP='DELETE' then old else new end;
end $$;
do $$ declare t text; begin
 foreach t in array array['bill','bill_text','bill_action','bill_summary','agency_document','cluster','court_opinion'] loop
 execute format('create trigger track_brief_source_change after insert or update or delete on public.%I for each row execute function public.track_brief_source_change()',t);
 end loop;
end $$;

create function public.begin_brief_source_run(p_source text,p_token uuid) returns boolean language plpgsql security invoker set search_path='' as $$
begin
 update public.brief_source_run set status='running',run_token=p_token,started_at=now(),lease_until=now()+interval '6 hours',error=null
 where source=p_source and (status<>'running' or lease_until<now());
 return found;
end $$;
create function public.end_brief_source_run(p_source text,p_token uuid,p_success boolean,p_error text default null,p_checkpoint jsonb default null) returns void language plpgsql security invoker set search_path='' as $$
begin
 update public.brief_source_run set status=case when p_success then 'success' else 'failed' end,
 finished_at=now(),lease_until=null,last_success_at=case when p_success then now() else last_success_at end,
 error=left(p_error,2000),checkpoint=coalesce(p_checkpoint,checkpoint)
 where source=p_source and run_token=p_token;
 if not found then raise exception 'Source run lease lost'; end if;
end $$;

-- Single-statement source read. JSON excludes ingestion timestamps and unstable child IDs.
create function public.brief_source_bundle(p_type text,p_id bigint) returns jsonb language plpgsql stable security invoker set search_path='' as $$
declare r jsonb;
begin
 if p_type='bill' then
 select (to_jsonb(b)-array['created_at','updated_at']) || jsonb_build_object(
 'texts',coalesce((select jsonb_agg(to_jsonb(t)-array['id','created_at','updated_at'] order by t.date desc nulls last,t.type) from public.bill_text t where t.bill_id=b.id),'[]'),
 'actions',coalesce((select jsonb_agg(to_jsonb(a)-array['id','created_at','updated_at'] order by a.date desc,a.text) from public.bill_action a where a.bill_id=b.id),'[]')) into r from public.bill b where b.id=p_id;
 elsif p_type='agency_document' then select to_jsonb(a)-array['created_at','updated_at'] into r from public.agency_document a where a.id=p_id;
 elsif p_type='cluster' then
 select (to_jsonb(c)-array['created_at','updated_at']) || jsonb_build_object('court',co.remote_id,
 'opinions',coalesce((select jsonb_agg(to_jsonb(o)-array['created_at','updated_at'] order by o.id) from public.court_opinion o where o.cluster_id=c.id),'[]')) into r
 from public.cluster c join public.court co on co.id=c.court_id where c.id=p_id;
 else raise exception 'Unsupported source'; end if;
 return r;
end $$;

create function public.enqueue_brief_job(p_type text,p_id bigint,p_revision bigint,p_fingerprint text,p_development text,p_item_type text,p_metadata jsonb,p_evidence jsonb,p_priority integer) returns bigint language plpgsql security invoker set search_path='' as $$
declare c public.brief_source_change; j bigint; s text;
begin
 s:=case p_type when 'bill' then 'congress' when 'cluster' then 'courtlistener' else 'federal_register' end;
 perform 1 from public.brief_source_run where source=s and status='success' for share;
 if not found then raise exception 'Source sync is incomplete'; end if;
 select * into c from public.brief_source_change where item_type=p_type and item_id=p_id for update;
 if c.revision is distinct from p_revision or public.brief_source_bundle(p_type,p_id) is distinct from p_metadata then raise exception 'Source changed during extraction'; end if;
 insert into public.brief_job(source_type,item_type,item_id,source_revision,fingerprint,development_key,source_metadata,evidence,priority)
 values(p_type,p_item_type,p_id,p_revision,p_fingerprint,p_development,p_metadata,p_evidence,p_priority)
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
 update public.brief_source_change set processed_revision=p_revision,error=null,attempts=0 where item_type=p_type and item_id=p_id;
 return j;
end $$;

create function public.claim_brief_job(p_token uuid) returns setof public.brief_job language plpgsql security invoker set search_path='' as $$
begin
 update public.brief_job set status='withheld',last_error='Worker repeatedly interrupted',lease_token=null,lease_until=null
 where status='processing' and lease_until<now() and attempts>=3;
 return query
 with candidate as (
 select j.id from public.brief_job j join public.brief_source_change c on c.item_type=j.source_type and c.item_id=j.item_id
 join public.brief_source_run s on s.source=case j.source_type when 'bill' then 'congress' when 'cluster' then 'courtlistener' else 'federal_register' end
 where ((j.status in ('pending','retry') and j.next_attempt_at<=now()) or (j.status='processing' and j.lease_until<now()))
 and j.attempts<3 and c.revision=j.source_revision and s.status='success'
 order by j.priority desc,j.created_at limit 1 for update of j skip locked)
 update public.brief_job j set status='processing',attempts=j.attempts+1,lease_token=p_token,lease_until=now()+interval '25 minutes',updated_at=now()
 from candidate c where j.id=c.id returning j.*;
end $$;
create function public.finish_brief_job(p_id bigint,p_token uuid,p_status text,p_reason text,p_draft jsonb default null,p_verification jsonb default null,p_writer text default '',p_verifier text default '',p_prompt text default '') returns void language plpgsql security invoker set search_path='' as $$
begin
 if p_status not in ('verified','retry','withheld','skipped') then raise exception 'Invalid completion state'; end if;
 perform 1 from public.brief_job where id=p_id and status='processing' and lease_token=p_token and lease_until>now() for update;
 if not found then raise exception 'Job lease lost'; end if;
 if p_draft is not null then
 insert into public.brief_attempt(job_id,draft,verification,passed,prompt_version,writer_model,verifier_model)
 values(p_id,p_draft,coalesce(p_verification,'{}'),p_status='verified',p_prompt,p_writer,p_verifier);
 end if;
 if p_status='verified' and (p_draft is null or coalesce((p_verification->>'passed')::boolean,false)=false or coalesce((p_verification->>'deterministic_passed')::boolean,false)=false) then raise exception 'Verification required'; end if;
 update public.brief_job set status=case when p_status='retry' and attempts>=3 then 'withheld' else p_status end,
 reason=left(p_reason,2000),last_error=case when p_status in ('retry','withheld') then left(p_reason,2000) else null end,
 lease_token=null,lease_until=null,updated_at=now(),next_attempt_at=now()+interval '30 minutes' where id=p_id;
end $$;

-- Reserve before every external call. An interrupted/uncertain request keeps its full reservation.
create function public.reserve_brief_api_call(p_job bigint,p_model text,p_stage text,p_amount numeric) returns uuid language plpgsql security invoker set search_path='' as $$
declare cap numeric; used numeric; result uuid;
begin
 select daily_budget_usd into cap from public.brief_pipeline_settings where id for update;
 if p_amount<=0 or p_amount>cap then raise exception 'Daily AI budget exhausted'; end if;
 select coalesce(sum(coalesce(actual_usd,reserved_usd)),0) into used from public.brief_api_call where budget_day=(now() at time zone 'UTC')::date;
 if used+p_amount>cap then raise exception 'Daily AI budget exhausted'; end if;
 insert into public.brief_api_call(job_id,model,stage,reserved_usd) values(p_job,p_model,p_stage,p_amount) returning id into result;
 return result;
end $$;

create function public.publish_verified_brief(p_job bigint) returns bigint language plpgsql security invoker set search_path='' as $$
declare j public.brief_job; a public.brief_attempt; c public.brief_source_change; cfg public.brief_pipeline_settings; result bigint; s text; d jsonb;
begin
 select * into cfg from public.brief_pipeline_settings where id for update;
 select * into j from public.brief_job where id=p_job for update;
 if j.status='published' then return j.brief_id; end if;
 if not cfg.publication_enabled or j.status<>'verified' then return null; end if;
 s:=case j.source_type when 'bill' then 'congress' when 'cluster' then 'courtlistener' else 'federal_register' end;
 perform 1 from public.brief_source_run where source=s and status='success' for share;
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

-- RLS plus explicit grants: no browser role can read evidence or operate the worker.
do $$ declare t text; f record; begin
 foreach t in array array['brief_pipeline_settings','brief_source_run','brief_source_change','brief_job','brief_attempt','brief_revision','brief_api_call'] loop
 execute format('alter table public.%I enable row level security',t);
 execute format('revoke all on public.%I from public,anon,authenticated',t);
 execute format('grant all on public.%I to service_role',t);
 end loop;
 for f in select p.oid::regprocedure as signature from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname in
 ('capture_brief_revision','track_brief_source_change','begin_brief_source_run','end_brief_source_run','brief_source_bundle','enqueue_brief_job','claim_brief_job','finish_brief_job','reserve_brief_api_call','publish_verified_brief') loop
 execute format('revoke all on function %s from public,anon,authenticated',f.signature);
 execute format('grant execute on function %s to service_role',f.signature);
 end loop;
end $$;
grant usage,select on sequence public.brief_job_id_seq,public.brief_attempt_id_seq,public.brief_revision_id_seq to service_role;

create function public.pending_brief_source_changes(p_limit integer default 100) returns setof public.brief_source_change language sql stable security invoker set search_path='' as $$
 select c.* from public.brief_source_change c join public.brief_source_run s on s.source=case c.item_type when 'bill' then 'congress' when 'cluster' then 'courtlistener' else 'federal_register' end
 where c.revision>c.processed_revision and c.next_attempt_at<=now() and s.status='success'
 order by c.changed_at,c.item_type,c.item_id limit greatest(1,least(p_limit,1000));
$$;
alter table public.brief_job add column work jsonb not null default '{}';
create function public.save_brief_work(p_id bigint,p_token uuid,p_work jsonb) returns void language plpgsql security invoker set search_path='' as $$
begin
 update public.brief_job set work=p_work,updated_at=now() where id=p_id and lease_token=p_token and lease_until>now() and status='processing';
 if not found then raise exception 'Job lease lost'; end if;
end $$;
create function public.defer_brief_budget(p_id bigint,p_token uuid,p_budget boolean default true) returns void language plpgsql security invoker set search_path='' as $$
begin
 update public.brief_job set status='retry',attempts=greatest(0,attempts-1),lease_token=null,lease_until=null,
 next_attempt_at=case when p_budget then ((now() at time zone 'UTC')::date+1)::timestamp at time zone 'UTC' else now()+interval '1 minute' end,last_error=case when p_budget then 'Daily AI budget exhausted' else 'Run time limit reached; progress saved' end,updated_at=now()
 where id=p_id and lease_token=p_token and lease_until>now() and status='processing';
 if not found then raise exception 'Job lease lost'; end if;
end $$;
create table public.brief_upstream_usage (
 day date not null, source text not null, requests integer not null default 0,
 primary key(day,source)
);
alter table public.brief_upstream_usage enable row level security;
revoke all on public.brief_upstream_usage from public,anon,authenticated;
grant all on public.brief_upstream_usage to service_role;
create function public.reserve_brief_upstream_request(p_source text,p_limit integer) returns boolean language plpgsql security invoker set search_path='' as $$
begin
 insert into public.brief_upstream_usage(day,source) values((now() at time zone 'UTC')::date,p_source) on conflict do nothing;
 update public.brief_upstream_usage set requests=requests+1 where day=(now() at time zone 'UTC')::date and source=p_source and requests<greatest(0,p_limit);
 return found;
end $$;
revoke all on function public.pending_brief_source_changes(integer),public.save_brief_work(bigint,uuid,jsonb),public.defer_brief_budget(bigint,uuid,boolean),public.reserve_brief_upstream_request(text,integer) from public,anon,authenticated;
grant execute on function public.pending_brief_source_changes(integer),public.save_brief_work(bigint,uuid,jsonb),public.defer_brief_budget(bigint,uuid,boolean),public.reserve_brief_upstream_request(text,integer) to service_role;

create function public.brief_pipeline_overview() returns jsonb language sql stable security invoker set search_path='' as $$
 select jsonb_build_object(
 'settings',(select to_jsonb(s) from public.brief_pipeline_settings s where id),
 'sources',(select jsonb_agg(to_jsonb(s) order by source) from public.brief_source_run s),
 'counts',(select coalesce(jsonb_object_agg(status,n),'{}') from (select status,count(*) n from public.brief_job group by status) c),
 'oldest_waiting',(select min(created_at) from public.brief_job where status in ('pending','retry','processing')),
 'pending_sources',(select count(*) from public.brief_source_change where revision>processed_revision),
 'source_errors',(select coalesce(jsonb_agg(to_jsonb(e)),'[]') from (select item_type,item_id,error,attempts,next_attempt_at from public.brief_source_change where error is not null order by changed_at desc limit 20) e),
 'spending',(select jsonb_build_object('accounted_usd',coalesce(sum(coalesce(actual_usd,reserved_usd)),0),'reserved_usd',coalesce(sum(reserved_usd) filter(where actual_usd is null),0),'calls',count(*)) from public.brief_api_call where budget_day=(now() at time zone 'UTC')::date),
 'jobs',(select coalesce(jsonb_agg(to_jsonb(j)),'[]') from (select id,item_type,item_id,source_metadata->>'title' title,source_metadata->>'case_name' case_name,priority,status,reason,last_error,attempts,created_at,updated_at,brief_id from public.brief_job order by updated_at desc,id desc limit 50) j)
 );
$$;
revoke all on function public.brief_pipeline_overview() from public,anon,authenticated;
grant execute on function public.brief_pipeline_overview() to service_role;

-- Explicit bounded bootstrap; existing briefs are excluded, future changes remain tracked.
create function public.seed_brief_source_changes(p_days integer default 30) returns bigint language plpgsql security invoker set search_path='' as $$
declare inserted bigint;
begin
 insert into public.brief_source_change(item_type,item_id)
 select 'bill',b.id from public.bill b where coalesce(b.updated_at at time zone 'UTC',b.created_at)>now()-make_interval(days=>greatest(1,least(p_days,90)))
 and not exists(select 1 from public.brief x where x.primary_item_id=b.id and x.primary_item_type in ('bill','law'))
 union all select 'agency_document',a.id from public.agency_document a where coalesce(a.updated_at at time zone 'UTC',a.created_at)>now()-make_interval(days=>greatest(1,least(p_days,90)))
 and not exists(select 1 from public.brief x where x.primary_item_id=a.id and x.primary_item_type in ('agency_document','executive_order'))
 union all select 'cluster',c.id from public.cluster c join public.court co on co.id=c.court_id where co.remote_id='scotus'
 and coalesce(c.updated_at at time zone 'UTC',c.created_at)>now()-make_interval(days=>greatest(1,least(p_days,90)))
 and not exists(select 1 from public.brief x where x.primary_item_id=c.id and x.primary_item_type='cluster')
 on conflict do nothing;
 get diagnostics inserted=row_count;
 return inserted;
end $$;
revoke all on function public.seed_brief_source_changes(integer) from public,anon,authenticated;
grant execute on function public.seed_brief_source_changes(integer) to service_role;

create function public.publishable_brief_jobs(p_limit integer default 10) returns table(id bigint) language sql stable security invoker set search_path='' as $$
 select j.id from public.brief_job j join public.brief_source_change c on c.item_type=j.source_type and c.item_id=j.item_id
 join public.brief_source_run s on s.source=case j.source_type when 'bill' then 'congress' when 'cluster' then 'courtlistener' else 'federal_register' end
 where j.status='verified' and c.revision=j.source_revision and s.status='success'
 order by j.priority desc,j.created_at limit greatest(1,least(p_limit,100));
$$;
revoke all on function public.publishable_brief_jobs(integer) from public,anon,authenticated;
grant execute on function public.publishable_brief_jobs(integer) to service_role;
