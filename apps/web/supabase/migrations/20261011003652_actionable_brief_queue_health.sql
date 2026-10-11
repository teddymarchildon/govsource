-- One eligibility predicate for claiming and health reporting. Keep blocked work
-- visible without calling it an overdue runnable backlog. No queued data is deleted.
create function public.brief_job_blocker(j public.brief_job, source_revision bigint, source_ready boolean)
returns text language sql stable security invoker set search_path='' as $$
 select case
 when j.status not in ('pending','retry','processing') then 'finished'
 when source_revision is null then 'missing_source'
 when j.source_revision is distinct from source_revision then 'source_changed'
 when not coalesce(source_ready,false) then 'source_not_ready'
 when j.status='processing' and j.lease_until>=now() then 'active_worker'
 when j.attempts>=3 then 'attempts_exhausted'
 when j.status='processing' and j.lease_until is null then 'missing_lease'
 when j.status in ('pending','retry') and (j.next_attempt_at is null or j.next_attempt_at>now()) then 'retry_scheduled'
 else null end;
$$;
revoke all on function public.brief_job_blocker(public.brief_job,bigint,boolean) from public,anon,authenticated;
grant execute on function public.brief_job_blocker(public.brief_job,bigint,boolean) to service_role;

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
 order by j.priority desc,j.created_at limit 1 for update of j skip locked)
 update public.brief_job j set status='processing',attempts=j.attempts+1,lease_token=p_token,lease_until=now()+interval '25 minutes',updated_at=now()
 from candidate c where j.id=c.id returning j.*;
end $$;

create or replace function public.brief_pipeline_overview() returns jsonb language sql stable security invoker set search_path='' as $$
 with waiting as materialized (
 select j.id,j.created_at,j.lease_until,j.status,
        j.development_date is null or j.development_date>=current_date-30 as current_queue,
        public.brief_job_blocker(j,c.revision,public.brief_source_ready(j.source_type,j.item_id)) as blocker
 from public.brief_job j left join public.brief_source_change c on c.item_type=j.source_type and c.item_id=j.item_id
 where j.status in ('pending','retry','processing')
 and (j.development_date is null or j.development_date>=current_date-30)
 )
 select jsonb_build_object(
 'eligible_current_waiting',(select count(*) from waiting where current_queue and blocker is null),
 'oldest_eligible_current_waiting',(select min(created_at) from waiting where current_queue and blocker is null),
 'last_current_progress_at',(select max(updated_at) from public.brief_job where attempts>0 and status in ('processing','retry','verified','published','withheld','skipped') and (development_date is null or development_date>=current_date-30)),
 'blocked_current_counts',(select coalesce(jsonb_object_agg(blocker,n),'{}') from (select blocker,count(*) n from waiting where current_queue and blocker is not null group by blocker) b),
 'oldest_eligible_current_job',(select id from waiting where current_queue and blocker is null order by created_at,id limit 1),
 'blocked_current_jobs',(select coalesce(jsonb_agg(to_jsonb(b)),'[]') from (select id,blocker,created_at from waiting where current_queue and blocker is not null order by created_at,id limit 20) b),
 'expired_current_leases',(select count(*) from waiting where current_queue and status='processing' and lease_until<now()),
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

