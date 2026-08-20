# Versioned-sync rollout

The versioned-sync upgrade is deliberately split across two production
releases. Do not combine them. This keeps the deployed direct-upsert client
working if a migration or GitHub Pages deployment fails, and gives already-open
tabs a compatibility window.

No paid Supabase feature, second project, or Supabase Branching environment is
required. The normal GitHub Actions workflow and the existing Free-plan project
are sufficient.

## Release 1: expand and deploy

The files currently in `supabase/migrations/` are expansion migrations. They:

- add revisions, mutation IDs, and bounded state history;
- install the compare-and-swap RPC used by the new frontend;
- validate IDs and JSON payloads at the database boundary; and
- temporarily retain direct insert/update access for the previous frontend.

Legacy direct writes pass through `guard_legacy_meal_planner_write`. The trigger
ignores caller-supplied revision metadata, archives the prior state, increments
the server revision, and records the authenticated user. The RPC marks its own
writes so the trigger does not archive or increment them twice.

The contract file remains in `supabase/contracts/` during this release. The
Supabase CLI only applies `supabase/migrations/`, so contract cannot run before
the matching frontend is live.

Before releasing:

1. Confirm SEC-001 through SEC-003 are complete and retain the verified local
   history bundles described in the security tracker.
2. Confirm the repository and Supabase migration secrets are configured without
   printing their values.
3. Run `npm test`, `npm run typecheck`, `npm run test:coverage`, and
   `npm run build`.
4. Confirm `20260819020000_contract_versioned_sync.sql` is still under
   `supabase/contracts/`, not `supabase/migrations/`.

Merge only the expansion release to `master`. The Pages workflow verifies and
builds first, applies the expansion migrations, and then deploys the already
prepared frontend artifact.

After the workflow succeeds:

1. Open the production app, make a harmless edit, reload, and confirm it remains.
2. If an old tab was intentionally kept open for the test, make a different
   harmless edit there and confirm a refreshed new client receives it.
3. In the Supabase SQL Editor, inspect only non-secret rollout metadata:

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

   The phase should be `expand`; read, insert, and update policies should be
   present during this temporary window.

Leave the database in `expand` for at least one normal usage cycle. Do not run
contract while investigating any client, sync, or deployment problem.

## Failure behavior during expansion

- If verification or build fails, no database or Pages change occurs.
- If the first migration succeeds and a later expansion migration fails, the
  deployed client retains its prior direct-write grants and policies. Fix the
  migration and retry; do not deploy manually around the failed workflow.
- If all expansion migrations succeed but Pages deployment fails, the old
  frontend continues through the guarded compatibility path. Retry or restore
  Pages while leaving the database in `expand`.
- If the new frontend has a regression, redeploy the preceding frontend while
  the compatibility bridge remains. Do not promote contract.

Each SQL migration is rerunnable only through normal Supabase migration
tracking. Never mark a failed migration as applied merely to bypass an error.

## Release 2: contract

Contract is a separate, later release after the new client has been confirmed.
Refresh or close intentionally retained old tabs first; direct-upsert builds are
no longer supported after this point.

Promote the prepared contract with:

```bash
git mv supabase/contracts/20260819020000_contract_versioned_sync.sql \
  supabase/migrations/20260819020000_contract_versioned_sync.sql
```

Run the complete checks again, then release this move by itself. Do not combine
contract with unrelated frontend or schema changes. The normal workflow applies
the contract migration before redeploying the already-confirmed RPC frontend.

The contract transaction:

- revokes direct insert/update table privileges;
- drops the temporary insert/update policies;
- removes the compatibility trigger and function; and
- changes the rollout marker from `expand` to `contract`.

If contract SQL fails, its transaction rolls back and the compatibility path
remains. Fix forward with a new migration; do not edit a migration after it has
been applied to production.

After contract succeeds, verify the production app can save and reload, then
check:

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

The phase should be `contract` and `legacy_write_policies` should be `0`.

## Recovery after contract

Do not roll Pages back to the legacy direct-upsert frontend after contract. If
the RPC frontend fails, fix it forward or deploy the last known-good RPC build.
The current state and up to 50 prior confirmed revisions remain server-side;
restoring one should be a deliberate SQL operation after taking a fresh backup.
Never paste state content, user IDs, project references, or credentials into an
issue, workflow log, or commit message.
