-- Only the server-side admin API may read or change editorial assignments.
create table public.brief_front_page (
  section text primary key check (section in ('home', 'campaign-finance', 'congress', 'white-house', 'agencies', 'courts')),
  lead_brief_id bigint references public.brief(id) on delete set null,
  supporting_brief_id bigint references public.brief(id) on delete set null,
  secondary_brief_id bigint references public.brief(id) on delete set null,
  version integer not null default 1 check (version > 0),
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id) on delete set null,
  check (lead_brief_id <> supporting_brief_id),
  check (lead_brief_id <> secondary_brief_id),
  check (supporting_brief_id <> secondary_brief_id)
);
alter table public.brief_front_page enable row level security;
revoke all on public.brief_front_page from public, anon, authenticated;
grant select, update on public.brief_front_page to service_role;

insert into public.brief_front_page(section)
values ('home'), ('campaign-finance'), ('congress'), ('white-house'), ('agencies'), ('courts');

create index on public.brief_front_page(lead_brief_id);
create index on public.brief_front_page(supporting_brief_id);
create index on public.brief_front_page(secondary_brief_id);
