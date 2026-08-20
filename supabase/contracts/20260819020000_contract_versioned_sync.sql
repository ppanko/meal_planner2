-- CONTRACT RELEASE — DO NOT move this file into supabase/migrations/ until the
-- expansion migration and RPC frontend have been deployed and verified.
--
-- Promotion command (in a later release):
--   git mv supabase/contracts/20260819020000_contract_versioned_sync.sql \
--     supabase/migrations/20260819020000_contract_versioned_sync.sql

do $$
declare
  current_phase text;
begin
  select phase into current_phase
  from public.meal_planner_release_state
  where id = 'versioned_sync'
  for update;

  if current_phase is null then
    raise exception 'Versioned-sync expansion has not been applied';
  end if;

  if current_phase not in ('expand', 'contract') then
    raise exception 'Unexpected versioned-sync release phase: %', current_phase;
  end if;

  revoke all on table public.meal_planner_state from anon, authenticated;
  grant select on table public.meal_planner_state to authenticated;
  revoke all on function public.meal_planner_state_is_valid(jsonb) from authenticated;
  revoke all on function public.meal_planner_json_keys_are_safe(jsonb, integer) from authenticated;
  revoke all on function public.meal_planner_state_is_valid(jsonb) from public;
  revoke all on function public.meal_planner_json_keys_are_safe(jsonb, integer) from public;

  drop policy if exists "household can create meal planner"
    on public.meal_planner_state;
  drop policy if exists "household can update meal planner"
    on public.meal_planner_state;

  drop trigger if exists guard_legacy_meal_planner_write
    on public.meal_planner_state;
  drop function if exists public.guard_legacy_meal_planner_write();

  update public.meal_planner_release_state
  set phase = 'contract', updated_at = now()
  where id = 'versioned_sync';
end $$;
