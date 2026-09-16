-- Meal Planner: anonymous enrollment, isolated households, and versioned state.
--
-- Run this file unchanged in the Supabase SQL Editor.
--
-- IMPORTANT:
-- At the end of the bootstrap-code statement, the script returns a random
-- HOUSEHOLD ACCESS CODE only the first time it is run. Save that code somewhere
-- private. It enrolls the owner's first device into the bootstrap household.
-- The plaintext code is never stored in the database.
--
-- Re-running this script preserves planner data, households, and enrolled users.

create extension if not exists pgcrypto with schema extensions;

-- Compatibility storage for the original household code. It remains while the
-- deployed legacy client is supported during the expansion window.
create table if not exists public.meal_planner_access (
  id text primary key,
  code_hash text not null,
  created_at timestamptz not null default now()
);

alter table public.meal_planner_access enable row level security;
revoke all on table public.meal_planner_access from anon, authenticated;

create table if not exists public.meal_planner_households (
  id uuid primary key,
  state_id text not null unique,
  name text not null,
  code_hash text not null unique,
  created_at timestamptz not null default now(),
  constraint meal_planner_household_name_valid check (
    char_length(btrim(name)) between 1 and 80
    and name !~ '[[:cntrl:]]'
  )
);

create table if not exists public.meal_planner_admins (
  user_id uuid primary key references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);

create table if not exists public.meal_planner_invites (
  id uuid primary key,
  token_hash text not null unique,
  created_by uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  redeemed_at timestamptz,
  redeemed_by uuid references auth.users(id) on delete set null,
  household_id uuid references public.meal_planner_households(id) on delete set null
);

alter table public.meal_planner_households enable row level security;
alter table public.meal_planner_admins enable row level security;
alter table public.meal_planner_invites enable row level security;
revoke all on table public.meal_planner_households from anon, authenticated;
revoke all on table public.meal_planner_admins from anon, authenticated;
revoke all on table public.meal_planner_invites from anon, authenticated;

-- Anonymous Supabase users belong to exactly one household.
create table if not exists public.meal_planner_members (
  user_id uuid primary key references auth.users(id) on delete cascade,
  household_id uuid references public.meal_planner_households(id) on delete cascade,
  enrolled_at timestamptz not null default now()
);

alter table public.meal_planner_members
  add column if not exists household_id uuid;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.meal_planner_members'::regclass
      and conname = 'meal_planner_members_household_id_fkey'
  ) then
    alter table public.meal_planner_members
      add constraint meal_planner_members_household_id_fkey
      foreign key (household_id)
      references public.meal_planner_households(id)
      on delete cascade;
  end if;
end $$;

alter table public.meal_planner_members enable row level security;
revoke all on table public.meal_planner_members from anon, authenticated;

-- Generate the bootstrap household code only when the legacy access row does
-- not yet exist. The SELECT returns the plaintext once; only its hash persists.
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

-- Every installation retains one bootstrap/legacy household. On an existing
-- project its join-code hash is copied from the original access row.
insert into public.meal_planner_households (id, state_id, name, code_hash)
select
  gen_random_uuid(),
  'household',
  'Household',
  access.code_hash
from public.meal_planner_access as access
where access.id = 'household'
on conflict (state_id) do update
set code_hash = excluded.code_hash;

update public.meal_planner_members as member
set household_id = household.id
from public.meal_planner_households as household
where member.household_id is null
  and household.state_id = 'household';

alter table public.meal_planner_members
  alter column household_id set not null;

-- Fresh databases begin contracted because no old direct-upsert frontend has
-- ever existed. Re-running setup against the old state table preserves expand.
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

-- Multi-household state IDs are UUID text for new households; do not recreate
-- the previous CHECK (id = 'household') constraint.
alter table public.meal_planner_state
  drop constraint if exists meal_planner_household_state_id;

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
      from public.meal_planner_members as member
      join public.meal_planner_households as household
        on household.id = member.household_id
      where member.user_id = auth.uid()
        and household.state_id = 'household'
    );
$$;

revoke all on function public.is_meal_planner_authorized() from public;
grant execute on function public.is_meal_planner_authorized() to authenticated;

create or replace function public.can_access_meal_planner_state(requested_state_id text)
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
      from public.meal_planner_members as member
      join public.meal_planner_households as household
        on household.id = member.household_id
      where member.user_id = auth.uid()
        and household.state_id = requested_state_id
    );
$$;

revoke all on function public.can_access_meal_planner_state(text) from public;
grant execute on function public.can_access_meal_planner_state(text) to authenticated;

create or replace function public.get_my_meal_planner_household()
returns table (
  household_id uuid,
  state_id text,
  household_name text,
  is_admin boolean
)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select
    household.id,
    household.state_id,
    household.name,
    exists (
      select 1
      from public.meal_planner_admins as admin
      where admin.user_id = auth.uid()
    )
  from public.meal_planner_members as member
  join public.meal_planner_households as household
    on household.id = member.household_id
  where member.user_id = auth.uid();
$$;

revoke all on function public.get_my_meal_planner_household() from public;
grant execute on function public.get_my_meal_planner_household() to authenticated;

create or replace function public.create_meal_planner_invite()
returns table (
  invite_token text,
  expires_at timestamptz
)
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $$
begin
  if auth.uid() is null
     or not exists (
       select 1
       from public.meal_planner_admins as admin
       where admin.user_id = auth.uid()
     ) then
    raise exception 'Not authorized';
  end if;

  invite_token := encode(extensions.gen_random_bytes(32), 'hex');
  expires_at := now() + interval '7 days';

  insert into public.meal_planner_invites (
    id, token_hash, created_by, expires_at
  ) values (
    gen_random_uuid(),
    encode(extensions.digest(invite_token, 'sha256'), 'hex'),
    auth.uid(),
    expires_at
  );

  return next;
end;
$$;

revoke all on function public.create_meal_planner_invite() from public;
grant execute on function public.create_meal_planner_invite() to authenticated;

create or replace function public.redeem_meal_planner_invite(
  invite_token text,
  requested_household_name text,
  initial_state jsonb
)
returns table (
  household_id uuid,
  state_id text,
  household_name text,
  is_admin boolean,
  join_code text
)
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $$
declare
  matched_invite public.meal_planner_invites%rowtype;
  created_household_id uuid;
  created_state_id text;
  normalized_name text;
  submitted_hash text;
begin
  if auth.uid() is null then
    raise exception 'Not authorized';
  end if;

  if exists (
    select 1
    from public.meal_planner_members as member
    where member.user_id = auth.uid()
  ) then
    raise exception 'This user already belongs to a household';
  end if;

  if invite_token is null or btrim(invite_token) = '' then
    raise exception 'Invitation is invalid, expired, or already used';
  end if;

  submitted_hash := encode(
    extensions.digest(btrim(invite_token), 'sha256'),
    'hex'
  );

  select invite.*
  into matched_invite
  from public.meal_planner_invites as invite
  where invite.token_hash = submitted_hash
  for update;

  if not found
     or matched_invite.redeemed_at is not null
     or matched_invite.expires_at <= now() then
    raise exception 'Invitation is invalid, expired, or already used';
  end if;

  normalized_name := btrim(requested_household_name);
  if normalized_name is null
     or char_length(normalized_name) < 1
     or char_length(normalized_name) > 80
     or normalized_name ~ '[[:cntrl:]]' then
    raise exception 'Invalid household name' using errcode = '22023';
  end if;

  if initial_state is null
     or not public.meal_planner_state_is_valid(initial_state) then
    raise exception 'Invalid shared state payload' using errcode = '22023';
  end if;

  created_household_id := gen_random_uuid();
  created_state_id := created_household_id::text;
  join_code := encode(extensions.gen_random_bytes(12), 'hex');

  insert into public.meal_planner_households (
    id, state_id, name, code_hash
  ) values (
    created_household_id,
    created_state_id,
    normalized_name,
    encode(extensions.digest(join_code, 'sha256'), 'hex')
  );

  insert into public.meal_planner_members (user_id, household_id)
  values (auth.uid(), created_household_id);

  perform set_config('meal_planner.versioned_rpc_write', 'on', true);

  insert into public.meal_planner_state (
    id, state, revision, updated_at, updated_by, last_mutation_id
  ) values (
    created_state_id,
    initial_state,
    1,
    now(),
    auth.uid(),
    null
  );

  update public.meal_planner_invites as invite
  set
    redeemed_at = now(),
    redeemed_by = auth.uid(),
    household_id = created_household_id
  where invite.id = matched_invite.id;

  household_id := created_household_id;
  state_id := created_state_id;
  household_name := normalized_name;
  is_admin := exists (
    select 1
    from public.meal_planner_admins as admin
    where admin.user_id = auth.uid()
  );

  return next;
end;
$$;

revoke all on function public.redeem_meal_planner_invite(text, text, jsonb) from public;
grant execute on function public.redeem_meal_planner_invite(text, text, jsonb) to authenticated;

create or replace function public.enroll_meal_planner_household(access_code text)
returns table (
  household_id uuid,
  state_id text,
  household_name text,
  is_admin boolean
)
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $$
declare
  matched_household public.meal_planner_households%rowtype;
  existing_household_id uuid;
  submitted_hash text;
begin
  if auth.uid() is null or access_code is null or btrim(access_code) = '' then
    return;
  end if;

  submitted_hash := encode(
    extensions.digest(btrim(access_code), 'sha256'),
    'hex'
  );

  select household.*
  into matched_household
  from public.meal_planner_households as household
  where household.code_hash = submitted_hash;

  if not found then
    return;
  end if;

  select member.household_id
  into existing_household_id
  from public.meal_planner_members as member
  where member.user_id = auth.uid();

  if existing_household_id is not null
     and existing_household_id <> matched_household.id then
    raise exception 'This user already belongs to another household';
  end if;

  if existing_household_id is null then
    insert into public.meal_planner_members (user_id, household_id)
    values (auth.uid(), matched_household.id);
  end if;

  household_id := matched_household.id;
  state_id := matched_household.state_id;
  household_name := matched_household.name;
  is_admin := exists (
    select 1
    from public.meal_planner_admins as admin
    where admin.user_id = auth.uid()
  );

  return next;
end;
$$;

revoke all on function public.enroll_meal_planner_household(text) from public;
grant execute on function public.enroll_meal_planner_household(text) to authenticated;

-- Legacy enrollment remains available only for the bootstrap household.
create or replace function public.enroll_meal_planner_device(access_code text)
returns boolean
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $$
declare
  expected_hash text;
  submitted_hash text;
  legacy_household_id uuid;
begin
  if auth.uid() is null or access_code is null or btrim(access_code) = '' then
    return false;
  end if;

  select access.code_hash
  into expected_hash
  from public.meal_planner_access as access
  where access.id = 'household';

  select household.id
  into legacy_household_id
  from public.meal_planner_households as household
  where household.state_id = 'household';

  if expected_hash is null or legacy_household_id is null then
    return false;
  end if;

  submitted_hash := encode(
    extensions.digest(btrim(access_code), 'sha256'),
    'hex'
  );

  if submitted_hash <> expected_hash then
    return false;
  end if;

  insert into public.meal_planner_members (user_id, household_id)
  values (auth.uid(), legacy_household_id)
  on conflict (user_id) do nothing;

  return exists (
    select 1
    from public.meal_planner_members as member
    where member.user_id = auth.uid()
      and member.household_id = legacy_household_id
  );
end;
$$;

revoke all on function public.enroll_meal_planner_device(text) from public;
grant execute on function public.enroll_meal_planner_device(text) to authenticated;

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

drop policy if exists "household can read meal planner" on public.meal_planner_state;
drop policy if exists "household can create meal planner" on public.meal_planner_state;
drop policy if exists "household can update meal planner" on public.meal_planner_state;

create policy "household can read meal planner"
on public.meal_planner_state
for select
to authenticated
using ((select public.can_access_meal_planner_state(id)));

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
  else
    revoke execute on function public.meal_planner_state_is_valid(jsonb) from authenticated;
    revoke execute on function public.meal_planner_json_keys_are_safe(jsonb, integer) from authenticated;
  end if;
end $$;

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
  if not public.can_access_meal_planner_state(requested_id) then
    raise exception 'Not authorized';
  end if;

  perform set_config('meal_planner.versioned_rpc_write', 'on', true);

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
