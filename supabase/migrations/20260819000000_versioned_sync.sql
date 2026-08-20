-- Add bounded history and compare-and-swap writes to an existing Meal Planner
-- database. Fresh projects must run supabase/setup.sql once before migrations.

do $$
begin
  if to_regclass('public.meal_planner_state') is null then
    raise exception 'Run supabase/setup.sql before applying Meal Planner migrations';
  end if;
end $$;

-- This marker distinguishes an existing legacy database, which needs a
-- compatibility window, from a fresh setup that is already contracted. A
-- later release promotes the contract SQL into supabase/migrations/.
create table if not exists public.meal_planner_release_state (
  id text primary key,
  phase text not null check (phase in ('expand', 'contract')),
  updated_at timestamptz not null default now(),
  constraint meal_planner_release_state_id check (id = 'versioned_sync')
);

alter table public.meal_planner_release_state enable row level security;
revoke all on table public.meal_planner_release_state from anon, authenticated;

insert into public.meal_planner_release_state (id, phase)
values ('versioned_sync', 'expand')
on conflict (id) do nothing;

alter table public.meal_planner_state
  add column if not exists revision bigint not null default 0;
alter table public.meal_planner_state
  add column if not exists updated_by uuid references auth.users(id) on delete set null;
alter table public.meal_planner_state
  add column if not exists last_mutation_id uuid;

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

-- Do not revoke the legacy table grants in this expansion migration. The
-- immediately preceding frontend still writes with a direct upsert; the next
-- migration installs a guarded compatibility trigger for those writes.

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
