# Versioned-sync and multi-household rollout

The production database remains in the `versioned_sync = 'expand'` phase while the multi-household frontend is introduced. This preserves the guarded direct-write path needed by already-open legacy clients while the new client moves to household-aware compare-and-swap state.

No paid Supabase feature, second project, or Supabase Branching environment is required. The normal GitHub Actions workflow and existing Supabase project are sufficient.

## Current expansion release

The immutable August migrations remain unchanged. The later multi-household expansion migration adds household identity and narrows the compatibility boundary without closing it.

During this phase:

- existing legacy household members may continue to use stale direct-upsert clients against `state_id = 'household'`;
- new households use UUID-backed state IDs and the compare-and-swap RPC;
- a new-household member is not authorized by the legacy direct-write policies or trigger;
- planner reads, RPC writes, Realtime subscriptions, IndexedDB caches, and pending sync queues are scoped by household state ID;
- `meal_planner_state` no longer has the old `CHECK (id = 'household')` constraint.

`guard_legacy_meal_planner_write` remains only as an expansion compatibility bridge. It archives the old legacy-household state and advances the server revision while refusing non-legacy household writes.

Before releasing the multi-household expansion:

1. Run `npm test`, `npm run typecheck`, `npm run test:coverage`, and `npm run build`.
2. Confirm `supabase/migrations/20260915000000_multi_household_expansion.sql` is the only new schema migration and no already-applied migration was edited.
3. Confirm the obsolete August prepared contract is not present as an active contract or migration.
4. Confirm no real user ID, household code, invitation token, project reference, or secret is present in committed files or logs.
5. Build the frontend before applying migrations, then let the normal deployment workflow apply the expansion migration before deploying that already-built artifact.

After deployment, manually verify:

1. The existing legacy household opens, saves, reloads, and Realtime-syncs normally.
2. An intentionally retained stale legacy client can still write the legacy household.
3. A newly created household cannot read or write `state_id = 'household'` through the stale-client path.
4. An admin can create a one-time invite; an unenrolled browser can redeem it and create a UUID-backed household state.
5. A second browser can join that new household with its household-specific code.
6. Legacy and new households never display or replay each other's local or remote state.

In the Supabase SQL Editor, rollout metadata may be checked without exposing secrets:

```sql
select phase
from public.meal_planner_release_state
where id = 'versioned_sync';

select policyname, cmd
from pg_policies
where schemaname = 'public'
  and tablename = 'meal_planner_state'
order by policyname;
```

The production phase should remain `expand` throughout the compatibility window. Leave it there for at least one normal usage cycle and while investigating any auth, sync, local-cache, or deployment problem.

## Failure behavior during expansion

- If verification or build fails, do not migrate or deploy.
- If the multi-household migration fails, fix forward with a new migration or correct an unapplied migration before retrying; never mark a failed migration applied merely to bypass it.
- If migration succeeds but Pages deployment fails, the old frontend remains usable for legacy-household members through the compatibility bridge. Retry the Pages deployment while leaving the database in `expand`.
- If the new frontend regresses, deploy the preceding compatible frontend while the bridge remains. Do not contract the database.

## Later contract release

The previously prepared `20260819020000_contract_versioned_sync.sql` is superseded and must not be promoted after the multi-household migration. Its timestamp and single-household assumptions predate the current schema.

Only after the multi-household frontend has been verified in production for a normal usage cycle should a **new later-timestamped contract migration** be authored. That migration should, against the household-aware schema that actually exists at that time:

- revoke temporary direct insert/update privileges on `meal_planner_state`;
- drop the temporary legacy insert/update policies;
- drop `guard_legacy_meal_planner_write` and any compatibility-only helper that is no longer needed;
- remove obsolete `meal_planner_access`/legacy enrollment compatibility only if no deployed client still relies on it;
- remove the build-time state-ID compatibility setting if no longer referenced; and
- change `meal_planner_release_state.phase` from `expand` to `contract`.

The contract must be its own later release, with the full test/build suite rerun and intentionally retained stale tabs closed or refreshed first.

After contract succeeds, verify production state can still save/reload and check:

```sql
select phase
from public.meal_planner_release_state
where id = 'versioned_sync';

select count(*) as legacy_write_policies
from pg_policies
where schemaname = 'public'
  and tablename = 'meal_planner_state'
  and cmd in ('INSERT', 'UPDATE');
```

Expected: `phase = 'contract'` and `legacy_write_policies = 0`.

## Recovery after contract

Do not roll Pages back to a direct-upsert frontend after contract. Fix forward or deploy the last known-good household-aware RPC build. The current state and bounded confirmed revision history remain server-side; restoring a revision should be a deliberate SQL operation after taking a fresh backup.

Never paste state content, user IDs, project references, household codes, invitation tokens, or credentials into an issue, workflow log, or commit message.
