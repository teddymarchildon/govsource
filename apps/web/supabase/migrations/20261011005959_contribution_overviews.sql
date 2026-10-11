-- Reuse the editorial Brief workflow, with one contribution overview per member/cycle.
alter table public.brief drop constraint brief_primary_item_type_check;
alter table public.brief add constraint brief_primary_item_type_check check (
  primary_item_type in ('bill','law','agency_document','cluster','executive_order','campaign_finance')
);
alter table public.brief add column contribution_cycle smallint;
alter table public.brief add constraint brief_contribution_cycle_check check (
  (primary_item_type = 'campaign_finance' and contribution_cycle is not null
    and contribution_cycle between 1980 and 2200 and contribution_cycle % 2 = 0)
  or (primary_item_type <> 'campaign_finance' and contribution_cycle is null)
);
create unique index brief_contribution_overview_unique on public.brief(primary_item_id,contribution_cycle)
  where primary_item_type = 'campaign_finance';
alter table public.brief_related_item drop constraint brief_related_item_type_check;
alter table public.brief_related_item add constraint brief_related_item_type_check check (
  item_type in ('bill','law','agency_document','cluster','executive_order','campaign_finance')
);

-- All aggregates retain signed corrections and respect the underlying public SELECT policies.
create view public.fec_contribution_month_totals with(security_invoker=true) as
select 'committees'::text as kind,cycle,receiving_committee_id,
  date_trunc('month',receipt_date::timestamp)::date as month,
  sum(amount) as total_amount,count(*) as contribution_count
from public.fec_committee_contribution group by cycle,receiving_committee_id,4
union all
select 'individuals'::text,cycle,receiving_committee_id,
  date_trunc('month',receipt_date::timestamp)::date,
  sum(amount),count(*)
from public.fec_individual_contribution group by cycle,receiving_committee_id,4;
grant select on public.fec_contribution_month_totals to anon,authenticated,service_role;

-- Match the existing employer/occupation grouping exactly when drilling into receipts.
create view public.fec_individual_receipts_normalized with(security_invoker=true) as
select r.*,nullif(upper(regexp_replace(btrim(r.employer),'\s+',' ','g')),'') as employer_normalized,
  nullif(upper(regexp_replace(btrim(r.occupation),'\s+',' ','g')),'') as occupation_normalized
from public.fec_individual_contribution r;
grant select on public.fec_individual_receipts_normalized to anon,authenticated,service_role;
