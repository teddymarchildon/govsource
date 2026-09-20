-- Individually itemized Form 3 receipts, isolated from the party/PAC importer.
create table public.fec_individual_contribution (
  cycle smallint not null check(cycle between 1980 and 2200 and cycle % 2 = 0),
  receiving_committee_id text not null references public.fec_committee(committee_id),
  sub_id text not null check(sub_id ~ '^[0-9]+$'),
  contributor_name text not null, employer text, occupation text, city text, state text,
  amount numeric(18,2) not null, receipt_date date,
  line_number text not null check(line_number='11AI'),
  transaction_id text, file_number text, image_number text, receipt_type text,
  amendment_indicator text, election_type text, fec_election_year text,
  source_url text not null,
  primary key(cycle,receiving_committee_id,sub_id)
);
create index fec_individual_receipt_page on public.fec_individual_contribution
  (cycle,receiving_committee_id,receipt_date desc nulls last,sub_id desc);

create table public.fec_individual_coverage (
  cycle smallint not null check(cycle between 1980 and 2200 and cycle % 2 = 0),
  committee_id text not null references public.fec_committee(committee_id),
  last_success_at timestamptz not null, receipt_count bigint not null,
  total_amount numeric(18,2) not null,
  primary key(cycle,committee_id)
);
create table private.fec_individual_sync (
  cycle smallint not null check(cycle between 1980 and 2200 and cycle % 2 = 0),
  committee_id text not null references public.fec_committee(committee_id),
  status text not null default 'idle' check(status in ('idle','running','partial','failed','success')),
  token uuid, lease_until timestamptz, checkpoint jsonb not null default '{}',
  error text, primary key(cycle,committee_id)
);
create table private.fec_individual_stage (
  cycle smallint not null, committee_id text not null, sub_id text not null, data jsonb not null,
  primary key(cycle,committee_id,sub_id),
  foreign key(cycle,committee_id) references private.fec_individual_sync(cycle,committee_id)
);
do $$ declare t text; begin
  foreach t in array array['fec_individual_contribution','fec_individual_coverage'] loop
    execute format('alter table public.%I enable row level security',t);
    execute format('revoke all on public.%I from public,anon,authenticated',t);
    execute format('grant select on public.%I to anon,authenticated',t);
    execute format('grant all on public.%I to service_role',t);
    execute format('create policy public_read on public.%I for select to anon,authenticated using(true)',t);
  end loop;
  foreach t in array array['fec_individual_sync','fec_individual_stage'] loop
    execute format('alter table private.%I enable row level security',t);
    execute format('revoke all on private.%I from public,anon,authenticated',t);
    execute format('grant all on private.%I to service_role',t);
  end loop;
end $$;

-- Only case and whitespace are normalized; no employer aliases or industries are inferred.
create view public.fec_individual_group_totals with(security_invoker=true) as
select r.cycle,r.receiving_committee_id,g.kind,g.label,
  sum(r.amount) as total_amount,count(*) as contribution_count
from public.fec_individual_contribution r
cross join lateral (values
  ('employer',nullif(upper(regexp_replace(btrim(r.employer),'\s+',' ','g')),'')),
  ('occupation',nullif(upper(regexp_replace(btrim(r.occupation),'\s+',' ','g')),''))
) g(kind,label)
group by r.cycle,r.receiving_committee_id,g.kind,g.label;
grant select on public.fec_individual_group_totals to anon,authenticated,service_role;

-- Eligible campaigns use the existing verified member mapping. Ambiguous links are skipped.
create view public.fec_individual_import_queue with(security_invoker=true) as
select l.cycle,l.committee_id,c.candidate_id,p.last_success_at
from public.fec_candidate_committee l
join public.fec_candidate c using(candidate_id)
left join public.fec_individual_coverage p on p.committee_id=l.committee_id and p.cycle=l.cycle
where c.congressman_id is not null and
  (select count(*) from public.fec_candidate_committee x where x.committee_id=l.committee_id and x.cycle=l.cycle)=1;
revoke all on public.fec_individual_import_queue from public,anon,authenticated;
grant select on public.fec_individual_import_queue to service_role;

create function public.begin_fec_individual_sync(p_cycle integer,p_committee text,p_token uuid,p_restart boolean default false)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare s private.fec_individual_sync;
begin
  if not exists(select 1 from public.fec_individual_import_queue where cycle=p_cycle and committee_id=p_committee) then
    raise exception 'Campaign has no unambiguous verified member link';
  end if;
  insert into private.fec_individual_sync(cycle,committee_id) values(p_cycle,p_committee) on conflict do nothing;
  select * into s from private.fec_individual_sync where cycle=p_cycle and committee_id=p_committee for update;
  if s.status='running' and s.lease_until>now() then raise exception 'Individual import already running'; end if;
  if p_restart or s.status in ('idle','success') then
    delete from private.fec_individual_stage where cycle=p_cycle and committee_id=p_committee;
    s.checkpoint := jsonb_build_object('version',1,'phase','receipts','cursor','{}'::jsonb,'fetched',0,'excluded',0);
  end if;
  update private.fec_individual_sync set status='running',token=p_token,lease_until=now()+interval '15 minutes',
    checkpoint=s.checkpoint,error=null where cycle=p_cycle and committee_id=p_committee;
  return s.checkpoint;
end $$;

create function public.stage_fec_individual_page(p_cycle integer,p_committee text,p_token uuid,p_expected jsonb,p_checkpoint jsonb,p_records jsonb)
returns void language plpgsql security invoker set search_path='' as $$
declare s private.fec_individual_sync; r jsonb; previous jsonb;
begin
  select * into s from private.fec_individual_sync where cycle=p_cycle and committee_id=p_committee for update;
  if not found or s.token is distinct from p_token or s.status<>'running' or s.lease_until<=now() then raise exception 'Individual import lease lost'; end if;
  if s.checkpoint is distinct from p_expected then raise exception 'Individual checkpoint changed'; end if;
  if jsonb_typeof(p_records) is distinct from 'array' or p_checkpoint->>'version' is distinct from '1'
    or p_checkpoint->>'phase' is null or p_checkpoint->>'phase' not in ('receipts','complete') then raise exception 'Invalid individual page'; end if;
  for r in select value from jsonb_array_elements(p_records) loop
    if r->>'receiving_committee_id' is distinct from p_committee then raise exception 'Receipt outside campaign scope'; end if;
    select data into previous from private.fec_individual_stage where cycle=p_cycle and committee_id=p_committee and sub_id=r->>'sub_id';
    if found and previous is distinct from r then raise exception 'FEC record changed during pagination; restart required'; end if;
    insert into private.fec_individual_stage(cycle,committee_id,sub_id,data) values(p_cycle,p_committee,r->>'sub_id',r) on conflict do nothing;
  end loop;
  update private.fec_individual_sync set checkpoint=p_checkpoint,lease_until=now()+interval '15 minutes'
    where cycle=p_cycle and committee_id=p_committee;
end $$;

create function public.publish_fec_individual_sync(p_cycle integer,p_committee text,p_token uuid)
returns bigint language plpgsql security invoker set search_path='' set statement_timeout='55s' as $$
declare s private.fec_individual_sync; n bigint; total numeric(18,2);
begin
  select * into s from private.fec_individual_sync where cycle=p_cycle and committee_id=p_committee for update;
  if found and s.token=p_token and s.status='success' then
    return (select receipt_count from public.fec_individual_coverage where cycle=p_cycle and committee_id=p_committee);
  end if;
  if not found or s.token is distinct from p_token or s.status<>'running' or s.lease_until<=now() then raise exception 'Individual import lease lost'; end if;
  if s.checkpoint->>'phase' is distinct from 'complete' then raise exception 'Individual import incomplete'; end if;
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
  insert into public.fec_individual_coverage(cycle,committee_id,last_success_at,receipt_count,total_amount)
    values(p_cycle,p_committee,now(),n,total) on conflict(cycle,committee_id) do update
    set last_success_at=excluded.last_success_at,receipt_count=excluded.receipt_count,total_amount=excluded.total_amount;
  update private.fec_individual_sync set status='success',lease_until=null,error=null where cycle=p_cycle and committee_id=p_committee;
  delete from private.fec_individual_stage where cycle=p_cycle and committee_id=p_committee;
  return n;
end $$;

create function public.finish_fec_individual_sync(p_cycle integer,p_committee text,p_token uuid,p_status text,p_error text)
returns void language plpgsql security invoker set search_path='' as $$
begin
  if p_status not in ('partial','failed') then raise exception 'Invalid individual status'; end if;
  update private.fec_individual_sync set status=p_status,lease_until=null,error=left(p_error,1000)
  where cycle=p_cycle and committee_id=p_committee and token=p_token and status='running' and lease_until>now();
  if not found then raise exception 'Individual import lease lost'; end if;
end $$;
do $$ declare f regprocedure; begin
  for f in select oid::regprocedure from pg_proc where pronamespace='public'::regnamespace and proname in
    ('begin_fec_individual_sync','stage_fec_individual_page','publish_fec_individual_sync','finish_fec_individual_sync') loop
    execute format('revoke all on function %s from public,anon,authenticated',f);
    execute format('grant execute on function %s to service_role',f);
  end loop;
end $$;
