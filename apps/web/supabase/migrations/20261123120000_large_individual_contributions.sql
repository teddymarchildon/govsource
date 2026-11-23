-- Individual coverage is limited to large itemized receipts (FEC min_amount).
-- A full-history import of a large campaign needs hundreds of thousands of
-- rows; briefs only need the large checks. Coverage records the threshold so
-- readers and drafting never mistake a subset total for all itemized receipts.
alter table public.fec_individual_coverage
  add column min_amount numeric(18,2) not null default 0 check(min_amount >= 0);

-- Existing full-history snapshots are supersets of the large-receipt scope:
-- trim them in place and keep their retrieval timestamps.
delete from public.fec_individual_contribution where amount < 1000;
update public.fec_individual_coverage c set min_amount = 1000,
  receipt_count = (select count(*) from public.fec_individual_contribution r
    where r.cycle = c.cycle and r.receiving_committee_id = c.committee_id),
  total_amount = (select coalesce(sum(amount), 0) from public.fec_individual_contribution r
    where r.cycle = c.cycle and r.receiving_committee_id = c.committee_id);

-- Incomplete full-history staging cannot be resumed under the new scope.
delete from private.fec_individual_stage;
update private.fec_individual_sync set status = 'idle', checkpoint = '{}', token = null, lease_until = null,
  error = 'Restarted for large-receipt scope' where status <> 'success';

create or replace view public.fec_individual_import_queue with(security_invoker=true) as
select l.cycle,l.committee_id,c.candidate_id,p.last_success_at,p.min_amount
from public.fec_candidate_committee l
join public.fec_candidate c using(candidate_id)
left join public.fec_individual_coverage p on p.committee_id=l.committee_id and p.cycle=l.cycle
where c.congressman_id is not null and
  (select count(*) from public.fec_candidate_committee x where x.committee_id=l.committee_id and x.cycle=l.cycle)=1;
revoke all on public.fec_individual_import_queue from public,anon,authenticated;
grant select on public.fec_individual_import_queue to service_role;

create or replace function public.publish_fec_individual_sync(p_cycle integer,p_committee text,p_token uuid)
returns bigint language plpgsql security invoker set search_path='' set statement_timeout='55s' as $$
declare s private.fec_individual_sync; n bigint; total numeric(18,2); threshold numeric(18,2);
begin
  select * into s from private.fec_individual_sync where cycle=p_cycle and committee_id=p_committee for update;
  if found and s.token=p_token and s.status='success' then
    return (select receipt_count from public.fec_individual_coverage where cycle=p_cycle and committee_id=p_committee);
  end if;
  if not found or s.token is distinct from p_token or s.status<>'running' or s.lease_until<=now() then raise exception 'Individual import lease lost'; end if;
  if s.checkpoint->>'phase' is distinct from 'complete' then raise exception 'Individual import incomplete'; end if;
  if jsonb_typeof(s.checkpoint->'min_amount') is distinct from 'number' or (s.checkpoint->>'min_amount')::numeric < 0 then
    raise exception 'Individual import threshold missing';
  end if;
  threshold := (s.checkpoint->>'min_amount')::numeric;
  if exists(select 1 from private.fec_individual_stage where cycle=p_cycle and committee_id=p_committee
    and (data->>'amount')::numeric < threshold) then raise exception 'Receipt below import threshold'; end if;
  delete from public.fec_individual_contribution where cycle=p_cycle and receiving_committee_id=p_committee;
  insert into public.fec_individual_contribution(cycle,receiving_committee_id,sub_id,contributor_name,employer,occupation,city,state,amount,receipt_date,
    line_number,transaction_id,file_number,image_number,receipt_type,amendment_indicator,election_type,fec_election_year,source_url)
  select p_cycle,p_committee,x.sub_id,x.contributor_name,x.employer,x.occupation,x.city,x.state,x.amount,x.receipt_date,
    x.line_number,x.transaction_id,x.file_number,x.image_number,x.receipt_type,x.amendment_indicator,x.election_type,x.fec_election_year,x.source_url
  from private.fec_individual_stage st cross join lateral jsonb_to_record(st.data) x(sub_id text,contributor_name text,employer text,occupation text,
    city text,state text,amount numeric(18,2),receipt_date date,line_number text,transaction_id text,file_number text,image_number text,
    receipt_type text,amendment_indicator text,election_type text,fec_election_year text,source_url text)
  where st.cycle=p_cycle and st.committee_id=p_committee;
  select count(*),coalesce(sum(amount),0) into n,total from public.fec_individual_contribution where cycle=p_cycle and receiving_committee_id=p_committee;
  insert into public.fec_individual_coverage(cycle,committee_id,last_success_at,receipt_count,total_amount,min_amount)
    values(p_cycle,p_committee,now(),n,total,threshold) on conflict(cycle,committee_id) do update
    set last_success_at=excluded.last_success_at,receipt_count=excluded.receipt_count,total_amount=excluded.total_amount,min_amount=excluded.min_amount;
  update private.fec_individual_sync set status='success',lease_until=null,error=null where cycle=p_cycle and committee_id=p_committee;
  delete from private.fec_individual_stage where cycle=p_cycle and committee_id=p_committee;
  return n;
end $$;
revoke all on function public.publish_fec_individual_sync(integer,text,uuid) from public,anon,authenticated;
grant execute on function public.publish_fec_individual_sync(integer,text,uuid) to service_role;
