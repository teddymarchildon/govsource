-- Direct party/PAC contributions reported by House and Senate campaigns.
create table public.fec_candidate (
  candidate_id text primary key check (candidate_id ~ '^[HS][0-9A-Z]{8}$'),
  congressman_id bigint references public.congressman(id),
  name text not null, office text not null check (office in ('H','S')),
  state text, district text, party text,
  updated_at timestamptz not null default now()
);
create index fec_candidate_member on public.fec_candidate(congressman_id);
create table public.fec_committee (
  committee_id text primary key check (committee_id ~ '^C[0-9]{8}$'),
  name text not null, committee_type text, designation text, organization_type text,
  updated_at timestamptz not null default now()
);
create table public.fec_candidate_committee (
  candidate_id text not null references public.fec_candidate(candidate_id),
  committee_id text not null references public.fec_committee(committee_id),
  cycle smallint not null check (cycle between 1980 and 2200 and cycle % 2 = 0),
  designation text not null check (designation in ('P','A')),
  primary key(candidate_id,committee_id,cycle)
);
create index fec_candidate_committee_recipient on public.fec_candidate_committee(committee_id,cycle);
create table public.fec_committee_contribution (
  cycle smallint not null check (cycle between 1980 and 2200 and cycle % 2 = 0),
  sub_id text not null,
  giving_committee_id text references public.fec_committee(committee_id),
  contributor_name text not null,
  receiving_committee_id text not null references public.fec_committee(committee_id),
  amount numeric(18,2) not null, receipt_date date,
  line_number text not null check (line_number in ('11B','11C')),
  transaction_id text, file_number text, image_number text, receipt_type text,
  amendment_indicator text, election_type text, fec_election_year text,
  source_url text not null, imported_at timestamptz not null default now(),
  primary key(cycle,sub_id)
);
create index fec_contribution_recipient on public.fec_committee_contribution(receiving_committee_id,cycle,receipt_date desc);
create index fec_contribution_giver on public.fec_committee_contribution(giving_committee_id,cycle);
create table public.fec_sync_state (
  cycle smallint primary key check (cycle between 1980 and 2200 and cycle % 2 = 0),
  status text not null default 'idle' check(status in ('idle','running','partial','failed','success')),
  run_token uuid, lease_until timestamptz,
  checkpoint jsonb not null default '{}',
  started_at timestamptz, finished_at timestamptz, last_success_at timestamptz,
  last_full_success_at timestamptz, published_scope text, published_rows bigint,
  error text
);

-- Internal scratch space, not another reader-facing data model or snapshot history.
create schema if not exists private;
create table private.fec_stage (
  cycle smallint not null references public.fec_sync_state(cycle),
  kind text not null check(kind in ('candidate','committee','link','contribution')),
  record_key text not null, data jsonb not null,
  primary key(cycle,kind,record_key)
);
alter table private.fec_stage enable row level security;
revoke all on private.fec_stage from public,anon,authenticated;
grant usage on schema private to service_role;
grant all on private.fec_stage to service_role;

do $$ declare t text; begin
  foreach t in array array['fec_candidate','fec_committee','fec_candidate_committee','fec_committee_contribution','fec_sync_state'] loop
    execute format('alter table public.%I enable row level security',t);
    execute format('revoke all on public.%I from public, anon, authenticated',t);
    execute format('grant all on public.%I to service_role',t);
    if t <> 'fec_sync_state' then
      execute format('grant select on public.%I to anon, authenticated',t);
      execute format('create policy public_read on public.%I for select to anon,authenticated using(true)',t);
    end if;
  end loop;
end $$;

create function public.begin_fec_sync(p_cycle integer,p_token uuid,p_scope text default 'all',p_restart boolean default false)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare s public.fec_sync_state;
begin
  if p_scope <> 'all' and p_scope !~ '^C[0-9]{8}$' then raise exception 'Invalid FEC scope'; end if;
  insert into public.fec_sync_state(cycle) values(p_cycle) on conflict do nothing;
  select * into s from public.fec_sync_state where cycle=p_cycle for update;
  if s.status='running' and s.lease_until>now() then raise exception 'FEC sync already running'; end if;
  if p_restart or s.status in ('idle','success') then
    delete from private.fec_stage where cycle=p_cycle;
    s.checkpoint := jsonb_build_object('version',1,'scope',p_scope,'phase','receipts','line',0,'cursor','{}'::jsonb,'fetched',0,'excluded',0);
  elsif s.checkpoint->>'scope' is distinct from p_scope or s.checkpoint->>'version' <> '1' then
    raise exception 'Pending FEC import uses another scope/version; use --restart explicitly';
  end if;
  update public.fec_sync_state set status='running',run_token=p_token,lease_until=now()+interval '15 minutes',
    checkpoint=s.checkpoint,started_at=case when p_restart or s.status in ('idle','success') then now() else started_at end,
    finished_at=null,error=null where cycle=p_cycle;
  return s.checkpoint;
end $$;

create function public.stage_fec_page(p_cycle integer,p_token uuid,p_expected jsonb,p_checkpoint jsonb,p_records jsonb)
returns void language plpgsql security invoker set search_path='' as $$
declare s public.fec_sync_state; r jsonb; previous jsonb;
begin
  select * into s from public.fec_sync_state where cycle=p_cycle for update;
  if s.run_token is distinct from p_token or s.status <> 'running' or s.lease_until<=now() then raise exception 'FEC lease lost'; end if;
  if s.checkpoint is distinct from p_expected then raise exception 'FEC checkpoint changed'; end if;
  if jsonb_typeof(p_records) <> 'array' or p_checkpoint->>'scope' is distinct from s.checkpoint->>'scope' then raise exception 'Invalid FEC page'; end if;
  for r in select value from jsonb_array_elements(p_records) loop
    if r->>'kind'='contribution' then
      select data into previous from private.fec_stage where cycle=p_cycle and kind='contribution' and record_key=r->>'key';
      if found and previous is distinct from r->'data' then raise exception 'FEC record changed during pagination; restart required'; end if;
    end if;
    insert into private.fec_stage(cycle,kind,record_key,data) values(p_cycle,r->>'kind',r->>'key',r->'data')
    on conflict(cycle,kind,record_key) do update set data=private.fec_stage.data || jsonb_strip_nulls(excluded.data);
  end loop;
  update public.fec_sync_state set checkpoint=p_checkpoint,lease_until=now()+interval '15 minutes' where cycle=p_cycle;
end $$;

create function public.fec_pending_candidates(p_cycle integer)
returns table(candidate_id text) language sql security invoker set search_path='' as $$
  select distinct l.data->>'candidate_id' from private.fec_stage l
  where l.cycle=p_cycle and l.kind='link' and not exists (
    select 1 from private.fec_stage c where c.cycle=p_cycle and c.kind='candidate' and c.record_key=l.data->>'candidate_id'
  ) order by 1 limit 50
$$;

create function public.finish_fec_sync(p_cycle integer,p_token uuid,p_status text,p_error text default null)
returns void language plpgsql security invoker set search_path='' as $$
begin
  if p_status not in ('partial','failed') then raise exception 'Invalid FEC status'; end if;
  update public.fec_sync_state set status=p_status,error=left(p_error,1000),finished_at=now(),lease_until=null
  where cycle=p_cycle and run_token=p_token and status='running' and lease_until>now();
  if not found then raise exception 'FEC lease lost'; end if;
end $$;

create function public.publish_fec_sync(p_cycle integer,p_token uuid)
returns bigint language plpgsql security invoker set search_path='' as $$
declare s public.fec_sync_state; n bigint;
begin
  select * into s from public.fec_sync_state where cycle=p_cycle for update;
  if s.run_token is distinct from p_token or s.status <> 'running' or s.lease_until<=now() then raise exception 'FEC lease lost'; end if;
  if s.checkpoint->>'phase' <> 'complete' then raise exception 'FEC import incomplete'; end if;
  if exists(select 1 from public.fec_pending_candidates(p_cycle)) then raise exception 'Unresolved FEC candidates'; end if;
  insert into public.fec_candidate(candidate_id,name,office,state,district,party)
  select x.candidate_id,x.name,x.office,x.state,x.district,x.party
  from private.fec_stage st cross join lateral jsonb_to_record(st.data) x(candidate_id text,name text,office text,state text,district text,party text)
  where st.cycle=p_cycle and st.kind='candidate'
  on conflict(candidate_id) do update set name=excluded.name,office=excluded.office,state=excluded.state,district=excluded.district,party=excluded.party,updated_at=now();
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

-- Ambiguous multi-candidate committee links are retained as evidence, not multiplied into totals.
create view public.fec_group_candidate_totals with(security_invoker=true) as
  select l.candidate_id,c.name as candidate_name,c.office,c.state,c.party,
    r.cycle,r.giving_committee_id,
    coalesce(g.name,r.contributor_name) as group_name,g.committee_type as group_type,
    sum(r.amount) as total_amount,count(*) as contribution_count,
    min(r.receipt_date) as first_receipt_date,max(r.receipt_date) as last_receipt_date
  from public.fec_committee_contribution r
  join public.fec_candidate_committee l on l.committee_id=r.receiving_committee_id and l.cycle=r.cycle
  join public.fec_candidate c on c.candidate_id=l.candidate_id
  left join public.fec_committee g on g.committee_id=r.giving_committee_id
  where (select count(*) from public.fec_candidate_committee m where m.committee_id=l.committee_id and m.cycle=l.cycle)=1
  group by l.candidate_id,c.name,c.office,c.state,c.party,r.cycle,r.giving_committee_id,coalesce(g.name,r.contributor_name),g.committee_type;
grant select on public.fec_group_candidate_totals to anon,authenticated,service_role;

do $$ declare f regprocedure; begin
  for f in select oid::regprocedure from pg_proc where pronamespace='public'::regnamespace and proname in (
    'begin_fec_sync','stage_fec_page','fec_pending_candidates','finish_fec_sync','publish_fec_sync') loop
    execute format('revoke all on function %s from public, anon, authenticated',f);
    execute format('grant execute on function %s to service_role',f);
  end loop;
end $$;
