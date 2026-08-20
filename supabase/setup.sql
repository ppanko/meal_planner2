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

-- Fresh databases start in the contracted phase because no legacy frontend
-- needs a compatibility window. If this rerunnable bootstrap encounters the
-- older state table, it selects the expansion phase and preserves that client's
-- write path until the later contract release.
create table if not exists public.meal_planner_release_state (
  id text primary key,
  phase text not null check (phase in ('expand', 'contract')),
  updated_at timestamptz not null default now(),
  constraint meal_planner_release_state_id check (id = 'versioned_sync')
);

alter table public.meal_planner_release_state enable row level security;
revoke all on table public.meal_planner_release_state from anon, authenticated;

insert into public.meal_planner_release_state (id, phase)
select
  'versioned_sync',
  case
    when to_regclass('public.meal_planner_state') is null then 'contract'
    else 'expand'
  end
on conflict (id) do nothing;

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

-- Recursively reject object keys that can alter JavaScript object prototypes
-- when persisted JSON is normalized by a browser client.
create or replace function public.meal_planner_json_keys_are_safe(
  value jsonb,
  nesting_depth integer default 0
)
returns boolean
language plpgsql
immutable
strict
set search_path = pg_catalog, pg_temp
as $$
declare
  object_entry record;
  array_value jsonb;
begin
  if nesting_depth > 32 then
    return false;
  end if;

  if jsonb_typeof(value) = 'object' then
    for object_entry in
      select entry.key, entry.value
      from jsonb_each(value) as entry(key, value)
    loop
      if object_entry.key in ('__proto__', 'prototype', 'constructor') then
        return false;
      end if;
      if not public.meal_planner_json_keys_are_safe(object_entry.value, nesting_depth + 1) then
        return false;
      end if;
    end loop;
  elsif jsonb_typeof(value) = 'array' then
    for array_value in select nested.value from jsonb_array_elements(value) as nested(value)
    loop
      if not public.meal_planner_json_keys_are_safe(array_value, nesting_depth + 1) then
        return false;
      end if;
    end loop;
  end if;

  return true;
end;
$$;

revoke all on function public.meal_planner_json_keys_are_safe(jsonb, integer) from public;

-- The browser always saves one complete normalized AppState. Keep the state
-- comfortably below Supabase Realtime's message ceiling and reject malformed
-- top-level containers before they can make every client fail to load.
create or replace function public.meal_planner_state_is_valid(value jsonb)
returns boolean
language sql
immutable
strict
set search_path = pg_catalog, pg_temp
as $$
  select
    jsonb_typeof(value) is not distinct from 'object'
    and octet_length(value::text) <= 750000
    and jsonb_typeof(value -> 'ingredients') is not distinct from 'array'
    and jsonb_typeof(value -> 'meals') is not distinct from 'array'
    and jsonb_typeof(value -> 'planner') is not distinct from 'object'
    and jsonb_typeof(value -> 'shoppingChecked') is not distinct from 'object'
    and jsonb_typeof(value -> 'manualShoppingItems') is not distinct from 'object'
    and jsonb_typeof(value -> 'proteinCategories') is not distinct from 'array'
    and jsonb_typeof(value -> 'plannerRowsByWeek') is not distinct from 'object'
    and jsonb_typeof(value -> 'shoppingHistory') is not distinct from 'array'
    and jsonb_typeof(value -> 'plannerNotes') is not distinct from 'object'
    and jsonb_typeof(value -> 'shoppingPurchasesByWeek') is not distinct from 'object'
    and jsonb_typeof(value -> 'shoppingDismissedByWeek') is not distinct from 'object'
    and jsonb_typeof(value -> 'shoppingCategories') is not distinct from 'array'
    and jsonb_typeof(value -> 'shoppingCategoryOrder') is not distinct from 'array'
    and public.meal_planner_json_keys_are_safe(value);
$$;

revoke all on function public.meal_planner_state_is_valid(jsonb) from public;

alter table public.meal_planner_state
  drop constraint if exists meal_planner_household_state_id;
alter table public.meal_planner_state
  add constraint meal_planner_household_state_id
  check (id = 'household') not valid;

alter table public.meal_planner_state
  drop constraint if exists meal_planner_nonnegative_revision;
alter table public.meal_planner_state
  add constraint meal_planner_nonnegative_revision
  check (revision >= 0) not valid;

alter table public.meal_planner_state
  drop constraint if exists meal_planner_valid_state_payload;
alter table public.meal_planner_state
  add constraint meal_planner_valid_state_payload
  check (public.meal_planner_state_is_valid(state)) not valid;

-- A rerun against the immediately previous schema remains backward compatible.
-- This trigger is installed only for an expansion-phase database.
create or replace function public.guard_legacy_meal_planner_write()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if current_setting('meal_planner.versioned_rpc_write', true) = 'on' then
    return new;
  end if;

  if not public.is_meal_planner_authorized() then
    raise exception 'Not authorized';
  end if;

  if new.id is distinct from 'household' then
    raise exception 'Invalid shared state ID' using errcode = '22023';
  end if;

  if new.state is null or not public.meal_planner_state_is_valid(new.state) then
    raise exception 'Invalid shared state payload' using errcode = '22023';
  end if;

  if tg_op = 'INSERT' then
    new.revision := 1;
  else
    if new.id is distinct from old.id then
      raise exception 'Shared state ID cannot be changed' using errcode = '22023';
    end if;

    insert into public.meal_planner_state_versions (
      state_id, revision, state, archived_at, archived_by, mutation_id
    ) values (
      old.id,
      old.revision,
      old.state,
      now(),
      old.updated_by,
      old.last_mutation_id
    )
    on conflict on constraint meal_planner_state_versions_pkey do nothing;

    new.revision := old.revision + 1;

    delete from public.meal_planner_state_versions as version
    where version.state_id = old.id
      and version.revision not in (
        select retained.revision
        from public.meal_planner_state_versions as retained
        where retained.state_id = old.id
        order by retained.revision desc
        limit 50
      );
  end if;

  new.updated_at := now();
  new.updated_by := auth.uid();
  new.last_mutation_id := null;
  return new;
end;
$$;

revoke all on function public.guard_legacy_meal_planner_write() from public;

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
using (
  id = 'household'
  and (select public.is_meal_planner_authorized())
);

drop trigger if exists guard_legacy_meal_planner_write
on public.meal_planner_state;

do $$
begin
  if exists (
    select 1
    from public.meal_planner_release_state
    where id = 'versioned_sync' and phase = 'expand'
  ) then
    grant insert, update on table public.meal_planner_state to authenticated;
    grant execute on function public.meal_planner_state_is_valid(jsonb) to authenticated;
    grant execute on function public.meal_planner_json_keys_are_safe(jsonb, integer) to authenticated;

    execute $policy$
      create policy "household can create meal planner"
      on public.meal_planner_state
      for insert
      to authenticated
      with check (
        id = 'household'
        and (select public.is_meal_planner_authorized())
      )
    $policy$;

    execute $policy$
      create policy "household can update meal planner"
      on public.meal_planner_state
      for update
      to authenticated
      using (
        id = 'household'
        and (select public.is_meal_planner_authorized())
      )
      with check (
        id = 'household'
        and (select public.is_meal_planner_authorized())
      )
    $policy$;

    create trigger guard_legacy_meal_planner_write
    before insert or update on public.meal_planner_state
    for each row execute function public.guard_legacy_meal_planner_write();
  end if;
end $$;

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

  perform set_config('meal_planner.versioned_rpc_write', 'on', true);

  if requested_id is distinct from 'household' then
    raise exception 'Invalid shared state ID' using errcode = '22023';
  end if;

  if expected_revision is null or expected_revision < 0 then
    raise exception 'Invalid expected revision' using errcode = '22023';
  end if;

  if mutation_id is null then
    raise exception 'Mutation ID is required' using errcode = '22023';
  end if;

  if requested_state is null or not public.meal_planner_state_is_valid(requested_state) then
    raise exception 'Invalid shared state payload' using errcode = '22023';
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
  on conflict on constraint meal_planner_state_versions_pkey do nothing;

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
