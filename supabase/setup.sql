-- Meal Planner: anonymous device enrollment + shared state.
--
-- Run this file unchanged in the Supabase SQL Editor.
--
-- IMPORTANT:
-- At the end, the script returns a random HOUSEHOLD ACCESS CODE the first
-- time it is run. Save that code somewhere private. Each permitted device
-- enters it once. The plaintext code is NOT stored in the database.
--
-- Re-running this script preserves both the existing shared planner data
-- and any already-enrolled devices.

create extension if not exists pgcrypto with schema extensions;

-- A single hashed household code. This table is not directly exposed.
create table if not exists public.meal_planner_access (
  id text primary key,
  code_hash text not null,
  created_at timestamptz not null default now()
);

alter table public.meal_planner_access enable row level security;
revoke all on table public.meal_planner_access from anon, authenticated;

-- Devices/users that successfully supplied the household code.
create table if not exists public.meal_planner_members (
  user_id uuid primary key references auth.users(id) on delete cascade,
  enrolled_at timestamptz not null default now()
);

alter table public.meal_planner_members enable row level security;
revoke all on table public.meal_planner_members from anon, authenticated;

-- Generate the household access code only if none exists yet.
-- The SELECT at the bottom of this statement returns the plaintext code once.
with generated as materialized (
  select encode(extensions.gen_random_bytes(12), 'hex') as code
),
inserted as (
  insert into public.meal_planner_access (id, code_hash)
  select
    'household',
    encode(extensions.digest(code, 'sha256'), 'hex')
  from generated
  on conflict (id) do nothing
  returning id
)
select code as household_access_code
from generated
where exists (select 1 from inserted);

-- Server-side membership check used both by the client and RLS.
create or replace function public.is_meal_planner_authorized()
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select
    auth.uid() is not null
    and exists (
      select 1
      from public.meal_planner_members
      where user_id = auth.uid()
    );
$$;

revoke all on function public.is_meal_planner_authorized() from public;
grant execute on function public.is_meal_planner_authorized() to authenticated;

-- Validate the household code and enroll the current anonymous/authenticated
-- Supabase user. The submitted plaintext code is never stored.
create or replace function public.enroll_meal_planner_device(access_code text)
returns boolean
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $$
declare
  expected_hash text;
  submitted_hash text;
begin
  if auth.uid() is null then
    return false;
  end if;

  select code_hash
  into expected_hash
  from public.meal_planner_access
  where id = 'household';

  if expected_hash is null then
    return false;
  end if;

  submitted_hash := encode(extensions.digest(access_code, 'sha256'), 'hex');

  if submitted_hash <> expected_hash then
    return false;
  end if;

  insert into public.meal_planner_members (user_id)
  values (auth.uid())
  on conflict (user_id) do nothing;

  return true;
end;
$$;

revoke all on function public.enroll_meal_planner_device(text) from public;
grant execute on function public.enroll_meal_planner_device(text) to authenticated;

-- Shared application state. Existing data is preserved.
create table if not exists public.meal_planner_state (
  id text primary key,
  state jsonb not null,
  revision bigint not null default 0,
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id) on delete set null,
  last_mutation_id uuid
);

alter table public.meal_planner_state add column if not exists revision bigint not null default 0;
alter table public.meal_planner_state add column if not exists updated_by uuid references auth.users(id) on delete set null;
alter table public.meal_planner_state add column if not exists last_mutation_id uuid;

-- Recent server-confirmed revisions provide a recovery path for accidental
-- edits without exposing history directly to browser clients.
create table if not exists public.meal_planner_state_versions (
  state_id text not null,
  revision bigint not null,
  state jsonb not null,
  archived_at timestamptz not null default now(),
  archived_by uuid references auth.users(id) on delete set null,
  mutation_id uuid,
  primary key (state_id, revision)
);

alter table public.meal_planner_state_versions enable row level security;
revoke all on table public.meal_planner_state_versions from anon, authenticated;

revoke all on table public.meal_planner_state from anon, authenticated;
grant select on table public.meal_planner_state to authenticated;

alter table public.meal_planner_state enable row level security;

-- Remove policies from the previous email-authorization version, if present.
drop policy if exists "household can read meal planner" on public.meal_planner_state;
drop policy if exists "household can create meal planner" on public.meal_planner_state;
drop policy if exists "household can update meal planner" on public.meal_planner_state;

create policy "household can read meal planner"
on public.meal_planner_state
for select
to authenticated
using ((select public.is_meal_planner_authorized()));

create policy "household can create meal planner"
on public.meal_planner_state
for insert
to authenticated
with check ((select public.is_meal_planner_authorized()));

create policy "household can update meal planner"
on public.meal_planner_state
for update
to authenticated
using ((select public.is_meal_planner_authorized()))
with check ((select public.is_meal_planner_authorized()));

-- Compare-and-swap writes prevent an older browser snapshot from silently
-- replacing a newer one. Retried mutation IDs are idempotent, and the prior
-- state is archived in the same transaction before a successful update.
create or replace function public.save_meal_planner_state(
  requested_id text,
  requested_state jsonb,
  expected_revision bigint,
  mutation_id uuid
)
returns table (
  status text,
  state jsonb,
  revision bigint,
  updated_at timestamptz,
  updated_by uuid
)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  current_row public.meal_planner_state%rowtype;
  saved_row public.meal_planner_state%rowtype;
begin
  if not public.is_meal_planner_authorized() then
    raise exception 'Not authorized';
  end if;

  select * into current_row
  from public.meal_planner_state as planner_state
  where planner_state.id = requested_id
  for update;

  if not found then
    if expected_revision <> 0 then
      raise exception 'Shared state does not exist at the expected revision';
    end if;

    insert into public.meal_planner_state (
      id, state, revision, updated_at, updated_by, last_mutation_id
    ) values (
      requested_id, requested_state, 1, now(), auth.uid(), mutation_id
    )
    on conflict (id) do nothing
    returning * into saved_row;

    if saved_row.id is not null then
      return query select
        'saved'::text,
        saved_row.state,
        saved_row.revision,
        saved_row.updated_at,
        saved_row.updated_by;
      return;
    end if;

    select * into current_row
    from public.meal_planner_state as planner_state
    where planner_state.id = requested_id;

    return query select
      'conflict'::text,
      current_row.state,
      current_row.revision,
      current_row.updated_at,
      current_row.updated_by;
    return;
  end if;

  if current_row.last_mutation_id = mutation_id then
    return query select
      'saved'::text,
      current_row.state,
      current_row.revision,
      current_row.updated_at,
      current_row.updated_by;
    return;
  end if;

  if current_row.revision <> expected_revision then
    return query select
      'conflict'::text,
      current_row.state,
      current_row.revision,
      current_row.updated_at,
      current_row.updated_by;
    return;
  end if;

  insert into public.meal_planner_state_versions (
    state_id, revision, state, archived_at, archived_by, mutation_id
  ) values (
    current_row.id,
    current_row.revision,
    current_row.state,
    now(),
    current_row.updated_by,
    current_row.last_mutation_id
  )
  on conflict (state_id, revision) do nothing;

  update public.meal_planner_state as planner_state
  set
    state = requested_state,
    revision = current_row.revision + 1,
    updated_at = now(),
    updated_by = auth.uid(),
    last_mutation_id = mutation_id
  where planner_state.id = requested_id
  returning planner_state.* into saved_row;

  delete from public.meal_planner_state_versions as version
  where version.state_id = requested_id
    and version.revision not in (
      select retained.revision
      from public.meal_planner_state_versions as retained
      where retained.state_id = requested_id
      order by retained.revision desc
      limit 50
    );

  return query select
    'saved'::text,
    saved_row.state,
    saved_row.revision,
    saved_row.updated_at,
    saved_row.updated_by;
end;
$$;

revoke all on function public.save_meal_planner_state(text, jsonb, bigint, uuid) from public;
grant execute on function public.save_meal_planner_state(text, jsonb, bigint, uuid) to authenticated;

-- Realtime support.
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
