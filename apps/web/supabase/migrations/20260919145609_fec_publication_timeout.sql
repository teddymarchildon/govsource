-- Bulk publication gets its own bounded timeout; role-wide timeouts stay unchanged.
create or replace function public.publish_fec_sync(p_cycle integer,p_token uuid)
returns bigint language plpgsql security invoker set search_path='' set statement_timeout='55s' as $$
declare s public.fec_sync_state; n bigint;
begin
  select * into s from public.fec_sync_state where cycle=p_cycle for update;
  if s.run_token=p_token and s.status='success' then return s.published_rows; end if;
  if s.run_token is distinct from p_token or s.status <> 'running' or s.lease_until<=now() then raise exception 'FEC lease lost'; end if;
  if s.checkpoint->>'phase' <> 'complete' then raise exception 'FEC import incomplete'; end if;
  if exists(select 1 from public.fec_pending_candidates(p_cycle)) then raise exception 'Unresolved FEC candidates'; end if;
  insert into public.fec_candidate(candidate_id,name,office,state,district,party)
  select x.candidate_id,x.name,x.office,x.state,x.district,x.party
  from private.fec_stage st cross join lateral jsonb_to_record(st.data) x(candidate_id text,name text,office text,state text,district text,party text)
  where st.cycle=p_cycle and st.kind='candidate'
  on conflict(candidate_id) do update set name=excluded.name,office=excluded.office,state=excluded.state,district=excluded.district,party=excluded.party,updated_at=now()
  where (fec_candidate.name,fec_candidate.office,fec_candidate.state,fec_candidate.district,fec_candidate.party) is distinct from (excluded.name,excluded.office,excluded.state,excluded.district,excluded.party);
  insert into public.fec_committee(committee_id,name,committee_type,designation,organization_type)
  select x.committee_id,x.name,x.committee_type,x.designation,x.organization_type
  from private.fec_stage st cross join lateral jsonb_to_record(st.data) x(committee_id text,name text,committee_type text,designation text,organization_type text)
  where st.cycle=p_cycle and st.kind='committee'
  on conflict(committee_id) do update set name=excluded.name,committee_type=coalesce(excluded.committee_type,fec_committee.committee_type),
    designation=coalesce(excluded.designation,fec_committee.designation),organization_type=coalesce(excluded.organization_type,fec_committee.organization_type),updated_at=now();

  delete from public.fec_committee_contribution where cycle=p_cycle and (s.checkpoint->>'scope'='all' or receiving_committee_id=s.checkpoint->>'scope');
  delete from public.fec_candidate_committee where cycle=p_cycle and (s.checkpoint->>'scope'='all' or committee_id=s.checkpoint->>'scope');
  insert into public.fec_candidate_committee(candidate_id,committee_id,cycle,designation)
  select x.candidate_id,x.committee_id,p_cycle,x.designation from private.fec_stage st
  cross join lateral jsonb_to_record(st.data) x(candidate_id text,committee_id text,designation text)
  where st.cycle=p_cycle and st.kind='link';
  insert into public.fec_committee_contribution(cycle,sub_id,giving_committee_id,contributor_name,receiving_committee_id,amount,receipt_date,
    line_number,transaction_id,file_number,image_number,receipt_type,amendment_indicator,election_type,fec_election_year,source_url)
  select p_cycle,x.sub_id,x.giving_committee_id,x.contributor_name,x.receiving_committee_id,x.amount,x.receipt_date,x.line_number,
    x.transaction_id,x.file_number,x.image_number,x.receipt_type,x.amendment_indicator,x.election_type,x.fec_election_year,x.source_url
  from private.fec_stage st cross join lateral jsonb_to_record(st.data) x(sub_id text,giving_committee_id text,contributor_name text,
    receiving_committee_id text,amount numeric(18,2),receipt_date date,line_number text,transaction_id text,file_number text,
    image_number text,receipt_type text,amendment_indicator text,election_type text,fec_election_year text,source_url text)
  where st.cycle=p_cycle and st.kind='contribution';
  get diagnostics n=row_count;
  update public.fec_sync_state set status='success',last_success_at=now(),
    last_full_success_at=case when checkpoint->>'scope'='all' then now() else last_full_success_at end,
    published_scope=checkpoint->>'scope',published_rows=n,finished_at=now(),lease_until=null,error=null where cycle=p_cycle;
  delete from private.fec_stage where cycle=p_cycle;
  return n;
end $$;
