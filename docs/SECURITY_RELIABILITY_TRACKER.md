# Security and reliability tracker

This document records the findings from the August 19, 2026 repository audit.
It is a release checklist, not evidence that a private application secret was
exposed. The audit found no household access code, database password, Supabase
secret/service key, access token, private key, or database connection string in
tracked files, Git history, or the production bundle.

Do not ship the versioned-sync database and frontend as one breaking release.
The database remains in an expansion compatibility phase while household-aware
auth and persistence are deployed. Contract cleanup remains blocked until the
multi-household frontend has been confirmed in production.

When closing an item, change its status to `Complete` and record the verifying
commit, test, or external setting. Never paste a real email address, token,
password, household code, invitation token, project reference, or user ID into
this file.

## Required before merge

### SEC-001 — Protect commit-author privacy

**Status:** Complete — protected locally and on both public branches

The public Git history contained a personal, non-`noreply` author email address.

Completion record:

- [x] Configure this repository to use the GitHub-provided `noreply` address.
- [x] Preserve the original refs in the verified, ignored local bundle
  `.local-history-backups/pre-sec001-history-2026-08-19.bundle` before rewriting.
- [x] Approve rewriting the existing public branch history. The local bundle is
  the recovery source and must never be pushed.
- [x] Rewrite local branch history and verify that branch commits use only the
  protected address before the coordinated force-push.
- [x] Enable GitHub's protection against command-line pushes that expose a private
  email address.
- [x] Confirm **Keep my email addresses private** remains enabled in GitHub
  account email settings.
- [x] Replace `master` and `feature/sync-data-protection` with exact
  force-with-lease checks and verify both resulting remote tips.

Verification: both local branches contain only the protected address in author
and committer metadata. Both public branch tips were replaced and verified on
August 19, 2026. Historical clones or provider caches may retain old objects;
the repository no longer advertises them through either branch.

### SEC-002 — Isolate deployment credentials and pin actions

**Status:** Complete — workflow structure and pins covered by automated tests

The Pages workflow previously made migration credentials available too broadly
and referenced third-party actions through mutable version tags.

Completion criteria:

- Split verification/build, database migration, and Pages deployment into
  separate jobs with the minimum permissions required by each job.
- Expose `SUPABASE_ACCESS_TOKEN`, `SUPABASE_DB_PASSWORD`, and
  `SUPABASE_PROJECT_ID` only to the migration steps that require them.
- Do not expose migration credentials to `npm` scripts, the application build,
  or Pages actions.
- Pin every GitHub Action to a reviewed full commit SHA. Keep a human-readable
  version comment beside each pin.
- Add or update workflow tests and validate the workflow before merging.

Verification: the deployment workflow has separate `verify`, `migrate`, and
`deploy` jobs; all actions and the Supabase CLI are fixed to reviewed versions;
workflow structure is asserted by `src/persistence/supabaseSetup.test.ts`.

### SEC-003 — Constrain and validate server-side state writes

**Status:** Complete for single-household production; multi-household extension pending branch verification

The original versioned-state RPC authenticated enrolled devices but did not
sufficiently constrain the requested state row or JSON payload.

Completion criteria:

- Restrict reads and writes to the caller's configured household state ID.
- Bind memberships to explicit household/state IDs when multi-household support is enabled.
- Enforce a conservative JSON byte limit compatible with Supabase Realtime.
- Validate required top-level fields and reject invalid container types,
  dangerous object keys, invalid revisions, and invalid mutation IDs.
- Remove obsolete insert/update policies instead of relying only on revoked
  table grants after the compatibility window closes.
- Apply equivalent protections to `supabase/setup.sql` and immutable migrations.
- Test unauthorized IDs, cross-household access, oversized data, malformed state,
  replayed mutations, and valid conflict/success paths.

The multi-household expansion additionally requires:

- RLS and no direct browser privileges on household, admin, invite, and member tables;
- household-scoped read/CAS authorization;
- stale direct-write authorization limited to the migrated legacy household;
- UUID-backed state IDs for new households; and
- local IndexedDB/localStorage and pending queues scoped by household state ID.

The branch implementing these extensions must run the complete automated suite
before merge; code changes alone are not verification evidence.

### SEC-004 — Make database and frontend releases backward-compatible

**Status:** Expansion extended for multi-household support — verification/deployment pending

The database is migrated before the matching Pages artifact is published. A
failed Pages deployment or an already-open old browser tab therefore requires a
backward-compatible database window.

Completion criteria:

- [x] Use an expand/deploy/contract rollout: introduce backward-compatible database
  capabilities, deploy the new client, and remove legacy write access only in a
  later confirmed release.
- [x] Ensure a failure at any release step leaves the currently deployed legacy
  household client able to read and save safely.
- [x] Exercise migrations through repeatable PostgreSQL-compatible PGlite tests.
- [x] Document the rollout and recovery procedure without including credentials.
- [ ] Verify the multi-household expansion migration and frontend with the full
  local/CI test, typecheck, coverage, and build suite.
- [ ] Deploy and verify the household-aware expansion while the database remains
  `versioned_sync = 'expand'`.
- [ ] After a stable usage cycle, author and deploy a **new later-timestamped**
  household-aware contract migration, then verify RPC saves and absence of
  legacy write policies.

The previously prepared August contract is superseded by the household
expansion and must not be promoted. Operational steps and recovery paths are in
`docs/VERSIONED_SYNC_ROLLOUT.md`. No production database should be contacted by
feature-branch verification.

## Optional architectural improvements

### OPT-001 — Offline cold-start authorization

**Status:** Deferred

Allow an enrolled device with cached data to open the local application while
offline. Tie the cached authorization decision to the stored Supabase user ID,
show a clear offline state, and revalidate authorization after reconnecting.

### OPT-002 — Dedicated browser origin

**Status:** Partially addressed

GitHub Pages project sites under the same `username.github.io` host share a
browser origin and therefore share access to localStorage, IndexedDB, and Cache
Storage. Household-aware persistence namespaces application state and pending
sync data by state ID, which prevents one Meal Planner household from replaying
another household's local queue. A dedicated GitHub Pages account or custom
origin remains a separate optional hardening measure.

## Additional follow-up backlog

- Add enrolled-device listing, access-code rotation, and device revocation.
- Add invitation revocation/list management if usage justifies it.
- Add a tested restore/export path for retained state versions and an encrypted
  offsite backup procedure.
- Add a React error boundary and graceful IndexedDB/localStorage quota handling.
- Add client-side schema validation and a safe recovery screen for malformed
  local or remote state.
- Add reasonable limits for names, notes, recipe steps, and collection sizes.
- Consider CAPTCHA or Turnstile for anonymous-signup abuse protection.
- Replace public screenshots if any displayed names, dates, or notes are real.
- Add dependency-update automation, secret scanning, and static analysis where
  available without exceeding the project's free-tier-only requirement.

## Audit verification baseline

At the time of the August audit:

- 183 tests passed across 30 test files.
- Coverage was 92% statements, 84% branches, 92% functions, and 95% lines.
- TypeScript checking and the production build passed.
- Production-preview HTML, manifest, JavaScript, and service-worker requests
  returned successfully.
- `npm audit` reported zero known dependency vulnerabilities.
- Anonymous live requests could not read planner state or call protected RPCs.
- The Git working tree was clean; the audit itself changed no application code.

Those numbers are historical baseline evidence, not verification of later
multi-household changes.
