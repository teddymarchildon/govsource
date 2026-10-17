-- Membership is managed by trusted database operators in the Supabase dashboard.
create table public.admin_user (
  user_id uuid primary key references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);
comment on table public.admin_user is 'GovSource administrators. Add an existing Authentication user UUID to grant access; delete the row to revoke it.';
alter table public.admin_user enable row level security;
revoke all on public.admin_user from public, anon, authenticated, service_role;
grant select on public.admin_user to service_role;

-- Bootstrap the existing verified owner only; future signups do not gain access.
insert into public.admin_user(user_id)
select id from auth.users
where lower(email) = 'ted.marchildon@gmail.com' and email_confirmed_at is not null
on conflict (user_id) do nothing;
