-- Meal Planner shared state + two-person authorization.
--
-- This file contains NO email addresses or API keys.
-- Run it unchanged in the Supabase SQL Editor.
--
-- After running it, add the two permitted email addresses to
-- public.meal_planner_authorized_users using Supabase Table Editor:
--
--   Table Editor -> meal_planner_authorized_users -> Insert row
--
-- The frontend's VITE_ALLOWED_EMAILS setting is only a convenience check.
-- The database table below is the real server-side authorization boundary.

create table if not exists public.meal_planner_authorized_users (
  email text primary key,
  created_at timestamptz not null default now(),
  constraint meal_planner_authorized_users_email_lowercase
    check (email = lower(email))
);

-- Do not expose the allowlist directly through the Data API.
alter table public.meal_planner_authorized_users enable row level security;
revoke all on table public.meal_planner_authorized_users from anon, authenticated;

create or replace function public.is_meal_planner_authorized()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.meal_planner_authorized_users
    where email = lower(coalesce((select auth.jwt()) ->> 'email', ''))
  );
$$;

revoke all on function public.is_meal_planner_authorized() from public;
grant execute on function public.is_meal_planner_authorized() to authenticated;

create table if not exists public.meal_planner_state (
  id text primary key,
  state jsonb not null,
  updated_at timestamptz not null default now()
);

revoke all on table public.meal_planner_state from anon, authenticated;
grant select, insert, update on table public.meal_planner_state to authenticated;

alter table public.meal_planner_state enable row level security;

drop policy if exists "household can read meal planner" on public.meal_planner_state;
drop policy if exists "household can create meal planner" on public.meal_planner_state;
drop policy if exists "household can update meal planner" on public.meal_planner_state;

create policy "household can read meal planner"
on public.meal_planner_state
for select
to authenticated
using (public.is_meal_planner_authorized());

create policy "household can create meal planner"
on public.meal_planner_state
for insert
to authenticated
with check (public.is_meal_planner_authorized());

create policy "household can update meal planner"
on public.meal_planner_state
for update
to authenticated
using (public.is_meal_planner_authorized())
with check (public.is_meal_planner_authorized());

-- Enable Postgres Changes realtime for the shared state table.
do $$
begin
  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'meal_planner_state'
  ) then
    alter publication supabase_realtime add table public.meal_planner_state;
  end if;
end $$;
