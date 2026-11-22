-- Rank screened candidates against each other before spending a drafting slot.
-- Selection passes now wait on a shortlist; drafting takes the highest score.
alter table public.brief_job
 add column selection_score integer check (selection_score between 0 and 100),
 add column shortlisted_at timestamptz;
alter table public.brief_job drop constraint brief_job_status_check;
alter table public.brief_job add constraint brief_job_status_check
 check (status in ('pending','processing','retry','shortlisted','verified','published','skipped','withheld','superseded'));
create index brief_job_shortlist on public.brief_job(selection_score desc,shortlisted_at) where status='shortlisted';

-- Only the worker holding the lease may shortlist. Returning a claimed job to the
-- shortlist keeps its original entry time, so it cannot wait there indefinitely.
create function public.shortlist_brief_job(p_id bigint,p_token uuid,p_score integer,p_reason text) returns void language plpgsql security invoker set search_path='' as $$
begin
 if p_score is null or p_score not between 0 and 100 then raise exception 'Invalid selection score'; end if;
 update public.brief_job set status='shortlisted',selection_score=p_score,shortlisted_at=coalesce(shortlisted_at,now()),
  reason=left(coalesce(p_reason,''),2000),last_error=null,attempts=0,lease_token=null,lease_until=null,updated_at=now()
 where id=p_id and manual_request_id is null and status='processing' and lease_token=p_token and lease_until>now();
 if not found then raise exception 'Job lease lost'; end if;
end $$;
revoke all on function public.shortlist_brief_job(bigint,uuid,integer,text) from public,anon,authenticated;
grant execute on function public.shortlist_brief_job(bigint,uuid,integer,text) to service_role;

-- Draft slots are released evenly across the UTC day (the first hour's share is
-- available at midnight), so a strong afternoon development still finds a slot.
-- The count mirrors reserve_brief_api_call, which remains the atomic daily cap.
create function public.claim_shortlisted_brief_job(p_token uuid,p_ttl_hours integer default 72) returns setof public.brief_job language plpgsql security invoker set search_path='' as $$
declare cfg public.brief_pipeline_settings; today date := (now() at time zone 'UTC')::date; used integer; released integer;
begin
 update public.brief_job set status='skipped',reason='Shortlist expired: outranked by higher-scoring candidates',updated_at=now()
 where status='shortlisted' and shortlisted_at < now()-make_interval(hours=>greatest(1,p_ttl_hours));
 select * into cfg from public.brief_pipeline_settings where id;
 select (select count(distinct job_id) from public.brief_api_call where budget_day=today and stage<>'selection')
  + (select count(*) from public.brief where primary_item_type='campaign_finance'
     and generation_metadata->>'trigger'='contribution-continuous'
     and created_at >= today::timestamp at time zone 'UTC') into used;
 released := ceil(cfg.daily_draft_limit * least(1.0,
  (extract(epoch from ((now() at time zone 'UTC') - today::timestamp)) + 3600) / 86400.0));
 if used >= released then return; end if;
 return query
 with candidate as (
 select j.id from public.brief_job j join public.brief_source_change c on c.item_type=j.source_type and c.item_id=j.item_id
 where j.status='shortlisted' and c.revision=j.source_revision and public.brief_source_ready(j.source_type,j.item_id)
 order by j.selection_score desc,j.development_date desc nulls last,j.shortlisted_at,j.id limit 1 for update of j skip locked)
 update public.brief_job j set status='processing',attempts=j.attempts+1,lease_token=p_token,lease_until=now()+interval '25 minutes',updated_at=now()
 from candidate c where j.id=c.id returning j.*;
end $$;
revoke all on function public.claim_shortlisted_brief_job(uuid,integer) from public,anon,authenticated;
grant execute on function public.claim_shortlisted_brief_job(uuid,integer) to service_role;

-- A changed source supersedes shortlisted work exactly as it does queued work.
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
 where manual_request_id is null and source_type=p_type and item_id=p_id and fingerprint<>p_fingerprint and status in ('pending','retry','processing','shortlisted','verified');
 update public.brief_job job set target_brief_id=b.id,target_version=b.version from public.brief b
 where job.id=j and job.status='pending' and b.primary_item_id=p_id
 and b.generation_metadata->>'development_key'=p_development
 and b.generation_metadata->>'pipeline'='continuous-v1';
 update public.brief_source_change set processed_revision=p_revision,error=null,attempts=0,error_kind=null where item_type=p_type and item_id=p_id;
 return j;
end $$;
