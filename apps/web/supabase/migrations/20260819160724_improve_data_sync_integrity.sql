-- Idempotency keys used by the data synchronization jobs.
-- These statements intentionally fail if historical duplicates exist so that
-- operators can inspect and merge referenced rows instead of deleting blindly.
-- Relationship-table duplicates are safe to collapse because their surrogate
-- IDs have no inbound foreign keys and the relationship itself is the identity.
delete from public.cosponsored_bills duplicate
using public.cosponsored_bills canonical
where duplicate.bill_id = canonical.bill_id
  and duplicate.congressman_id = canonical.congressman_id
  and duplicate.id > canonical.id;

delete from public.agency_agencydocument duplicate
using public.agency_agencydocument canonical
where duplicate.agency_id = canonical.agency_id
  and duplicate.agency_document_id = canonical.agency_document_id
  and duplicate.id > canonical.id;

create unique index if not exists congressman_bioguide_id_uidx
  on public.congressman (bioguide_id);
create unique index if not exists sponsored_bills_pair_uidx
  on public.sponsored_bills (bill_id, congressman_id);
create unique index if not exists cosponsored_bills_pair_uidx
  on public.cosponsored_bills (bill_id, congressman_id);
create unique index if not exists congressman_term_identity_uidx
  on public.congressman_term (
    congressman_id,
    congress,
    chamber,
    coalesce(state, ''),
    coalesce(district, '')
  );
create unique index if not exists agency_remote_agency_id_uidx
  on public.agency (remote_agency_id);
create unique index if not exists agency_document_remote_number_uidx
  on public.agency_document (remote_document_number);
create unique index if not exists agency_document_pair_uidx
  on public.agency_agencydocument (agency_id, agency_document_id);
create unique index if not exists court_remote_id_uidx
  on public.court (remote_id);
create unique index if not exists cluster_remote_id_uidx
  on public.cluster (remote_id);
create unique index if not exists judge_remote_id_uidx
  on public.judge (remote_id);
create unique index if not exists court_opinion_remote_id_uidx
  on public.court_opinion (remote_id);
create unique index if not exists bill_text_dated_identity_uidx
  on public.bill_text (bill_id, date, coalesce(type, ''))
  where date is not null;
create unique index if not exists bill_text_undated_identity_uidx
  on public.bill_text (bill_id, fallback_key, coalesce(type, ''))
  where date is null;

-- Foreign-key indexes used by reconciliation and frontend joins.
create index if not exists sponsored_bills_bill_id_idx on public.sponsored_bills (bill_id);
create index if not exists cosponsored_bills_bill_id_idx on public.cosponsored_bills (bill_id);
create index if not exists congressman_term_congressman_id_idx
  on public.congressman_term (congressman_id);
create index if not exists bill_action_bill_id_idx on public.bill_action (bill_id);
create index if not exists bill_text_bill_id_idx on public.bill_text (bill_id);
create index if not exists bill_summary_bill_idx on public.bill_summary (bill);
create index if not exists agency_document_document_id_idx
  on public.agency_agencydocument (agency_document_id);
create index if not exists court_opinion_cluster_id_idx on public.court_opinion (cluster_id);
create index if not exists cluster_court_id_idx on public.cluster (court_id);

create or replace function public.replace_bill_actions(
  p_bill_id bigint,
  p_actions jsonb
)
returns integer
language plpgsql
security invoker
set search_path = ''
as $$
declare
  inserted_count integer;
begin
  delete from public.bill_action where bill_id = p_bill_id;
  insert into public.bill_action (bill_id, date, text, type)
  select distinct
    p_bill_id,
    (item->>'date')::date,
    item->>'text',
    coalesce(item->>'type', '')
  from jsonb_array_elements(coalesce(p_actions, '[]'::jsonb)) as item
  where nullif(item->>'date', '') is not null
    and nullif(item->>'text', '') is not null;
  get diagnostics inserted_count = row_count;
  return inserted_count;
end;
$$;

create or replace function public.replace_congressman_terms(
  p_congressman_id bigint,
  p_terms jsonb
)
returns integer
language plpgsql
security invoker
set search_path = ''
as $$
declare
  inserted_count integer;
begin
  delete from public.congressman_term where congressman_id = p_congressman_id;
  insert into public.congressman_term (
    congressman_id, congress, chamber, start_year, end_year, state, district
  )
  select distinct
    p_congressman_id,
    (item->>'congress')::smallint,
    item->>'chamber',
    (item->>'start_year')::smallint,
    nullif(item->>'end_year', '')::smallint,
    coalesce(item->>'state', ''),
    nullif(item->>'district', '')
  from jsonb_array_elements(coalesce(p_terms, '[]'::jsonb)) as item;
  get diagnostics inserted_count = row_count;
  return inserted_count;
end;
$$;

create or replace function public.replace_bill_children(
  p_bill_id bigint,
  p_sponsor_ids jsonb,
  p_cosponsor_ids jsonb,
  p_texts jsonb,
  p_actions jsonb,
  p_summaries jsonb
)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
begin
  delete from public.sponsored_bills where bill_id = p_bill_id;
  insert into public.sponsored_bills (bill_id, congressman_id)
  select distinct p_bill_id, trim(both '"' from value::text)::bigint
  from jsonb_array_elements(coalesce(p_sponsor_ids, '[]'::jsonb));

  delete from public.cosponsored_bills where bill_id = p_bill_id;
  insert into public.cosponsored_bills (bill_id, congressman_id)
  select distinct p_bill_id, trim(both '"' from value::text)::bigint
  from jsonb_array_elements(coalesce(p_cosponsor_ids, '[]'::jsonb));

  delete from public.bill_text where bill_id = p_bill_id;
  insert into public.bill_text (
    bill_id, date, type, fallback_key, pdf_url, html_url, xml_url,
    pdf_file_path, html_file_path, xml_file_path
  )
  select
    p_bill_id,
    nullif(item->>'date', '')::timestamptz::date,
    nullif(item->>'type', ''),
    nullif(item->>'fallback_key', ''),
    nullif(item->>'pdf_url', ''),
    nullif(item->>'html_url', ''),
    nullif(item->>'xml_url', ''),
    nullif(item->>'pdf_file_path', ''),
    nullif(item->>'html_file_path', ''),
    nullif(item->>'xml_file_path', '')
  from jsonb_array_elements(coalesce(p_texts, '[]'::jsonb)) as item;

  perform public.replace_bill_actions(p_bill_id, p_actions);

  delete from public.bill_summary where bill = p_bill_id;
  insert into public.bill_summary (bill, date, text)
  select distinct
    p_bill_id,
    (item->>'date')::date,
    item->>'text'
  from jsonb_array_elements(coalesce(p_summaries, '[]'::jsonb)) as item
  where nullif(item->>'date', '') is not null
    and nullif(item->>'text', '') is not null;
end;
$$;

create or replace function public.replace_agency_document_relationships(
  p_agency_document_id bigint,
  p_agency_ids jsonb
)
returns integer
language plpgsql
security invoker
set search_path = ''
as $$
declare
  inserted_count integer;
begin
  delete from public.agency_agencydocument
  where agency_document_id = p_agency_document_id;
  insert into public.agency_agencydocument (agency_id, agency_document_id)
  select distinct trim(both '"' from value::text)::bigint, p_agency_document_id
  from jsonb_array_elements(coalesce(p_agency_ids, '[]'::jsonb));
  get diagnostics inserted_count = row_count;
  return inserted_count;
end;
$$;

create or replace function public.preview_agency_parent_reconciliation()
returns bigint
language sql
stable
security invoker
set search_path = ''
as $$
  select count(*)
  from public.agency child
  join public.agency parent
    on parent.remote_agency_id = child.remote_parent_id
  where child.parent_id is distinct from parent.id;
$$;

create or replace function public.reconcile_agency_parents()
returns integer
language plpgsql
security invoker
set search_path = ''
as $$
declare
  updated_count integer;
begin
  update public.agency child
  set parent_id = parent.id
  from public.agency parent
  where parent.remote_agency_id = child.remote_parent_id
    and child.parent_id is distinct from parent.id;
  get diagnostics updated_count = row_count;
  return updated_count;
end;
$$;

-- ETL functions are callable only with the server-side service role.
revoke execute on function public.replace_bill_actions(bigint, jsonb)
  from public, anon, authenticated;
revoke execute on function public.replace_congressman_terms(bigint, jsonb)
  from public, anon, authenticated;
revoke execute on function public.replace_bill_children(bigint, jsonb, jsonb, jsonb, jsonb, jsonb)
  from public, anon, authenticated;
revoke execute on function public.replace_agency_document_relationships(bigint, jsonb)
  from public, anon, authenticated;
revoke execute on function public.preview_agency_parent_reconciliation()
  from public, anon, authenticated;
revoke execute on function public.reconcile_agency_parents()
  from public, anon, authenticated;

grant execute on function public.replace_bill_actions(bigint, jsonb) to service_role;
grant execute on function public.replace_congressman_terms(bigint, jsonb) to service_role;
grant execute on function public.replace_bill_children(bigint, jsonb, jsonb, jsonb, jsonb, jsonb)
  to service_role;
grant execute on function public.replace_agency_document_relationships(bigint, jsonb)
  to service_role;
grant execute on function public.preview_agency_parent_reconciliation() to service_role;
grant execute on function public.reconcile_agency_parents() to service_role;
