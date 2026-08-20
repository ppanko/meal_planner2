-- Constrain the versioned sync boundary to one bounded, structurally valid
-- household state. This migration intentionally does not change rollout order;
-- the backward-compatible release work remains tracked separately as SEC-004.

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
