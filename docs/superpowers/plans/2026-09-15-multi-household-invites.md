# Multi-household Invites Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add admin-created one-time household invites so each invited user can create an isolated planner household with its own join code, while preserving the currently deployed legacy household and versioned-sync compatibility window.

**Architecture:** Supabase remains the security boundary. A new household table owns display name, state ID, and join-code hash; memberships bind one anonymous Supabase user to exactly one household; invite creation/redemption happens only through `SECURITY DEFINER` RPCs. The React client resolves a `HouseholdSession` before mounting planner persistence, then scopes remote reads/writes, Realtime subscriptions, IndexedDB state, and pending sync queues by `stateId`.

**Tech Stack:** React 19, TypeScript, Vite, Supabase anonymous auth/Postgres/RLS/Realtime, IndexedDB, Vitest, Testing Library, PGlite.

**Spec:** `docs/superpowers/specs/2026-09-15-multi-household-invites-design.md`

## Global Constraints

- Only the app owner may create invitations.
- Anonymous Supabase auth remains the browser identity mechanism; no passwords or third-party OAuth are added.
- Each anonymous user belongs to exactly one household.
- Invitation links are single-use and expire after seven days.
- Invitation tokens use 32 random bytes; household join codes use 12 random bytes; only SHA-256 hashes are stored.
- Existing legacy household data, existing members, and stale legacy clients must remain usable during expansion.
- New-household users must never gain access to the legacy `state_id = 'household'` row through the stale-client compatibility path.
- All planner state, IndexedDB caches, localStorage fallbacks, pending sync queues, Supabase reads/writes, and Realtime subscriptions must be scoped by resolved `stateId`.
- The old unscoped local cache may migrate only into `stateId = 'household'`.
- The hard `meal_planner_household_state_id CHECK (id = 'household')` constraint must be removed.
- The obsolete `supabase/contracts/20260819020000_contract_versioned_sync.sql` path must be retired rather than promoted after the multi-household migration.
- No real email, Supabase user ID, join code, invite token, project reference, or secret may appear in committed tests/docs.

## File structure

Create:
- `supabase/migrations/20260915000000_multi_household_expansion.sql` — expansion-only schema/RPC/RLS changes.
- `src/households/types.ts` — shared household/session result types.
- `src/households/api.ts` — typed wrappers around household RPCs.
- `src/households/HouseholdContext.tsx` — provider and `useHouseholdSession()` hook.
- `src/households/InviteHouseholdModal.tsx` — admin invite creation/copy UI.

Modify:
- `supabase/setup.sql` — fresh-project multi-household bootstrap.
- `SUPABASE_SETUP.md` — current owner bootstrap, invite, join-code, and rollout instructions.
- `src/persistence/supabaseSql.integration.test.ts` — executable SQL/RLS/RPC coverage.
- `src/persistence/supabaseSetup.test.ts` — source-of-truth/setup/contract-retirement assertions.
- `src/AuthGate.tsx`, `src/AuthGate.test.tsx` — household resolution, join-code enrollment, invite redemption, auth-race protection.
- `src/persistence/localState.ts`, `src/storage.ts`, `src/persistence/remoteState.ts` — household-scoped local/remote persistence.
- `src/supabase.ts`, `src/supabase.test.ts` — retain only compatibility configuration; no normal persistence lookup through `sharedStateId`.
- `src/storage.test.ts`, `src/storage.remote.test.ts`, `src/state/usePersistentAppState.ts`, `src/state/usePersistentAppState.test.ts` — persistence regression coverage.
- `src/App.tsx`, `src/App.test.tsx`, `src/styles.css` — admin invite entry point/modal.
- `docs/VERSIONED_SYNC_ROLLOUT.md`, `docs/SECURITY_RELIABILITY_TRACKER.md`, `.github/workflows/deploy.yml` — current expansion/contract operational truth.

Delete:
- `supabase/contracts/20260819020000_contract_versioned_sync.sql` — superseded prepared contract; a later household-aware contract will be created only after production verification.

---

### Task 1: Add the multi-household database boundary

**Files:**
- Create: `supabase/migrations/20260915000000_multi_household_expansion.sql`
- Modify: `supabase/setup.sql`
- Modify: `src/persistence/supabaseSql.integration.test.ts`
- Modify: `src/persistence/supabaseSetup.test.ts`

**Interfaces:**
- Produces RPC `get_my_meal_planner_household()` returning `household_id uuid, state_id text, household_name text, is_admin boolean`.
- Produces RPC `create_meal_planner_invite()` returning `invite_token text, expires_at timestamptz`.
- Produces RPC `redeem_meal_planner_invite(invite_token text, household_name text, initial_state jsonb)` returning household columns plus `join_code text`.
- Produces RPC `enroll_meal_planner_household(access_code text)` returning household columns.
- Produces helper `can_access_meal_planner_state(requested_state_id text)`.
- Preserves old `is_meal_planner_authorized()` and `enroll_meal_planner_device(text)` only for the migrated legacy household.

- [ ] **Step 1: Write failing PGlite tests for schema and household isolation**

Follow the existing `db.query(...)` pattern in `supabaseSql.integration.test.ts`. Add direct catalog checks such as:

```ts
const constraint = await db.query<{ count: number }>(`
  select count(*)::int as count
  from pg_constraint
  where conname = 'meal_planner_household_state_id'
`)
expect(constraint.rows[0]).toEqual({ count: 0 })

const rls = await db.query<{ relname: string; relrowsecurity: boolean }>(`
  select relname, relrowsecurity
  from pg_class
  where relname in (
    'meal_planner_households',
    'meal_planner_admins',
    'meal_planner_invites',
    'meal_planner_members'
  )
  order by relname
`)
expect(rls.rows.every((row) => row.relrowsecurity)).toBe(true)
```

For UUID state support, insert two test users, enroll them into separate household rows, set `request.jwt.claim.sub` before each operation, then assert `save_meal_planner_state(uuidStateId, ...)` succeeds only for the matching member and rejects the other household. Add the same two-user setup to prove `is_meal_planner_authorized()` remains true only for the migrated legacy household.

- [ ] **Step 2: Run the focused SQL tests and verify red**

Run:

```bash
npm test -- src/persistence/supabaseSql.integration.test.ts src/persistence/supabaseSetup.test.ts
```

Expected: failures for missing household tables/RPCs, the still-present single-state constraint, and old global authorization semantics.

- [ ] **Step 3: Implement household tables and migration/backfill**

Create these tables in the expansion migration and equivalent current definitions in `setup.sql`:

```sql
create table public.meal_planner_households (
  id uuid primary key,
  state_id text not null unique,
  name text not null,
  code_hash text not null unique,
  created_at timestamptz not null default now()
);

create table public.meal_planner_admins (
  user_id uuid primary key references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);

create table public.meal_planner_invites (
  id uuid primary key,
  token_hash text not null unique,
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  redeemed_at timestamptz,
  redeemed_by uuid references auth.users(id),
  household_id uuid references public.meal_planner_households(id)
);
```

Generate UUID values inside the relevant SQL statements/functions with `gen_random_uuid()`; add `household_id uuid` to `meal_planner_members`, create/backfill one legacy household whose `state_id = 'household'` and `code_hash` copies the existing legacy access hash, then make membership `household_id` non-null with FK. Keep `user_id` as the primary key.

Explicitly execute:

```sql
alter table public.meal_planner_state
  drop constraint if exists meal_planner_household_state_id;
```

Do not recreate that constraint in `setup.sql`.

- [ ] **Step 4: Implement server authorization and RPCs**

Use household-aware authorization:

```sql
create or replace function public.can_access_meal_planner_state(requested_state_id text)
returns boolean
language sql
security definer
stable
set search_path = public, pg_temp
as $$
  select exists (
    select 1
    from public.meal_planner_members m
    join public.meal_planner_households h on h.id = m.household_id
    where m.user_id = auth.uid()
      and h.state_id = requested_state_id
  );
$$;
```

Redefine `is_meal_planner_authorized()` to return true only for membership in the household whose `state_id = 'household'`. Update the read policy, `save_meal_planner_state()`, legacy direct-write policies, and `guard_legacy_meal_planner_write()` accordingly.

`create_meal_planner_invite()` must generate `encode(extensions.gen_random_bytes(32), 'hex')`, store only `encode(extensions.digest(token, 'sha256'), 'hex')`, set `expires_at = now() + interval '7 days'`, and require `auth.uid()` in `meal_planner_admins`.

`redeem_meal_planner_invite()` must lock the invite row `for update`, validate unused/unexpired token and 1-80 character trimmed name with no control characters, create household/member/initial state atomically, mark redemption, and return the plaintext 12-byte hex join code once.

`enroll_meal_planner_household()` hashes the submitted code, resolves exactly one household, rejects an already-enrolled caller, inserts membership, and returns household context.

- [ ] **Step 5: Lock down new tables**

Apply explicit statements to every new/direct-membership table:

```sql
alter table public.meal_planner_households enable row level security;
alter table public.meal_planner_admins enable row level security;
alter table public.meal_planner_invites enable row level security;
alter table public.meal_planner_members enable row level security;

revoke all on table public.meal_planner_households from anon, authenticated;
revoke all on table public.meal_planner_admins from anon, authenticated;
revoke all on table public.meal_planner_invites from anon, authenticated;
revoke all on table public.meal_planner_members from anon, authenticated;
```

Grant only `execute` on the intended RPCs to `authenticated`. Keep direct planner-state `select` for Realtime/read sync, scoped by RLS.

- [ ] **Step 6: Update fresh-project bootstrap**

`setup.sql` must create one bootstrap household with `state_id = 'household'`, generate one 12-byte plaintext bootstrap code in the existing setup flow, store the same hash in both compatibility access storage and `meal_planner_households.code_hash`, and leave `meal_planner_admins` empty until the owner manually inserts their enrolled anonymous user ID.

- [ ] **Step 7: Run SQL tests green**

Run:

```bash
npm test -- src/persistence/supabaseSql.integration.test.ts src/persistence/supabaseSetup.test.ts
```

Expected: PASS, including UUID state creation/save, cross-household denial, stale-client legacy behavior, invite replay/expiry, RLS, and bootstrap assertions.

- [ ] **Step 8: Commit**

```bash
git add supabase/migrations/20260915000000_multi_household_expansion.sql supabase/setup.sql src/persistence/supabaseSql.integration.test.ts src/persistence/supabaseSetup.test.ts
git commit -m "feat: add multi-household database boundary"
```

---

### Task 2: Retire the obsolete contract path and update operator docs

**Files:**
- Delete: `supabase/contracts/20260819020000_contract_versioned_sync.sql`
- Modify: `docs/VERSIONED_SYNC_ROLLOUT.md`
- Modify: `docs/SECURITY_RELIABILITY_TRACKER.md`
- Modify: `SUPABASE_SETUP.md`
- Modify: `.github/workflows/deploy.yml`
- Modify: `src/persistence/supabaseSetup.test.ts`
- Modify: `src/persistence/supabaseSql.integration.test.ts`

**Interfaces:**
- Produces one operational rule: database remains in `versioned_sync = 'expand'` until a new post-household contract migration is authored after production verification.
- Produces current operator instructions for bootstrap household enrollment, manual admin designation, invite creation, and household-specific join codes.

- [ ] **Step 1: Add failing source assertions**

Assert repository text no longer exposes the old promotion command or treats the August contract as active:

```ts
expect(rolloutDoc).not.toContain('git mv supabase/contracts/20260819020000_contract_versioned_sync.sql')
expect(workflow).not.toContain('Contract SQL remains under supabase/contracts')
expect(setupDoc).toContain('meal_planner_admins')
expect(setupDoc).toContain('Invite household')
```

- [ ] **Step 2: Run focused tests red**

```bash
npm test -- src/persistence/supabaseSetup.test.ts src/persistence/supabaseSql.integration.test.ts
```

- [ ] **Step 3: Delete the obsolete contract and update operational docs**

`VERSIONED_SYNC_ROLLOUT.md` must state that the August prepared contract is superseded by multi-household expansion and that a new later-timestamped contract will eventually revoke temporary direct insert/update grants, drop the compatibility policies/trigger, and set the release marker to `contract`.

Update the security tracker to the same current state. Replace the deploy workflow comment with a neutral statement that only expansion-compatible migrations live under `supabase/migrations/` during this release.

Update `SUPABASE_SETUP.md` so fresh setup is: run setup SQL, save bootstrap household code, enroll the owner device, identify that anonymous user ID in Supabase, insert it into `meal_planner_admins`, then use the app's `Invite household` control for new households. Document that household join codes add another device/person to that same household and that email delivery remains manual.

- [ ] **Step 4: Run focused tests green and commit**

```bash
npm test -- src/persistence/supabaseSetup.test.ts src/persistence/supabaseSql.integration.test.ts
git add docs/VERSIONED_SYNC_ROLLOUT.md docs/SECURITY_RELIABILITY_TRACKER.md SUPABASE_SETUP.md .github/workflows/deploy.yml src/persistence/supabaseSetup.test.ts src/persistence/supabaseSql.integration.test.ts
git rm supabase/contracts/20260819020000_contract_versioned_sync.sql
git commit -m "docs: retire obsolete sync contract path"
```

---

### Task 3: Add typed household APIs and race-safe AuthGate resolution

**Files:**
- Create: `src/households/types.ts`
- Create: `src/households/api.ts`
- Create: `src/households/HouseholdContext.tsx`
- Modify: `src/AuthGate.tsx`
- Modify: `src/AuthGate.test.tsx`

**Interfaces:**

```ts
export type HouseholdSession = {
  householdId: string
  stateId: string
  householdName: string
  isAdmin: boolean
}

export type HouseholdInvite = { token: string; expiresAt: string }
export type RedeemedHousehold = HouseholdSession & { joinCode: string }

export async function getMyHousehold(): Promise<HouseholdSession | null>
export async function enrollHousehold(accessCode: string): Promise<HouseholdSession | null>
export async function createHouseholdInvite(): Promise<HouseholdInvite>
export async function redeemHouseholdInvite(token: string, householdName: string): Promise<RedeemedHousehold>
export function useHouseholdSession(): HouseholdSession
```

- [ ] **Step 1: Rewrite AuthGate tests to the new household contract**

Replace boolean enrollment mocks with rows like:

```ts
const household = {
  household_id: '11111111-1111-1111-1111-111111111111',
  state_id: 'household',
  household_name: 'Home',
  is_admin: true,
}
```

Test enrolled rendering, join-code enrollment via `enroll_meal_planner_household`, failed enrollment, and anonymous sign-in errors.

Add an out-of-order race test: start household lookup for `user-1`, emit auth change to `user-2`, resolve `user-2` first, then resolve `user-1`; children must retain only user-2 household context.

- [ ] **Step 2: Run AuthGate tests red**

```bash
npm test -- src/AuthGate.test.tsx
```

- [ ] **Step 3: Implement typed RPC wrappers and context**

`api.ts` must use these RPC calls exactly:

```ts
const { data, error } = await supabase.rpc('get_my_meal_planner_household')
const { data, error } = await supabase.rpc('enroll_meal_planner_household', { access_code: accessCode })
const { data, error } = await supabase.rpc('create_meal_planner_invite')
const { data, error } = await supabase.rpc('redeem_meal_planner_invite', {
  invite_token: token,
  household_name: householdName.trim(),
  initial_state: normalizeState({}),
})
```

Normalize Supabase snake_case rows into the exported camelCase types and throw RPC errors. Passing `normalizeState({})` as `initial_state` ensures a new household never inherits browser-local planner data.

`HouseholdContext.tsx` exposes:

```tsx
const HouseholdContext = createContext<HouseholdSession | null>(null)

export function HouseholdProvider({ value, children }: { value: HouseholdSession; children: ReactNode }) {
  return <HouseholdContext.Provider value={value}>{children}</HouseholdContext.Provider>
}

export function useHouseholdSession() {
  const value = useContext(HouseholdContext)
  if (!value) throw new Error('Household session is unavailable.')
  return value
}
```

- [ ] **Step 4: Make AuthGate resolution race-safe**

Use a monotonically increasing generation ref:

```ts
const resolutionGeneration = useRef(0)

async function refresh(nextSession: Session | null) {
  const generation = ++resolutionGeneration.current
  setSession(nextSession)
  setHousehold(null)
  setChecking(true)
  const resolved = nextSession ? await getMyHousehold() : null
  if (!mounted || generation !== resolutionGeneration.current) return
  setHousehold(resolved)
  setChecking(false)
}
```

When enrollment succeeds, set the returned `HouseholdSession` directly. Render children only inside `HouseholdProvider` when both session and household are current.

- [ ] **Step 5: Run AuthGate tests green and commit**

```bash
npm test -- src/AuthGate.test.tsx src/AuthGate.unconfigured.test.tsx
git add src/households src/AuthGate.tsx src/AuthGate.test.tsx
git commit -m "feat: resolve household sessions in auth gate"
```

---

### Task 4: Scope all local and remote persistence by household state ID

**Files:**
- Modify: `src/persistence/localState.ts`
- Modify: `src/persistence/remoteState.ts`
- Modify: `src/storage.ts`
- Modify: `src/supabase.ts`
- Modify: `src/supabase.test.ts`
- Modify: `src/state/usePersistentAppState.ts`
- Modify: `src/storage.test.ts`
- Modify: `src/storage.remote.test.ts`
- Modify: `src/state/usePersistentAppState.test.ts`

**Interfaces:**

Change persistence signatures to require `stateId`:

```ts
loadLocalState(stateId: string)
cacheState(stateId: string, state: AppState)
loadLocalSyncSnapshot(stateId: string)
cacheLocalSyncSnapshot(stateId: string, snapshot: LocalSyncSnapshot)
hasStoredLocalState(stateId: string)
resetLocalState(stateId: string)
readRemoteState(stateId: string)
writeRemoteState(stateId: string, state: AppState, expectedRevision: number, mutationId: string)
subscribeToRemoteState(stateId: string, onState: (snapshot: RemoteStateSnapshot) => void)
loadSyncState(stateId: string)
saveState(stateId: string, state: AppState, expectedRevision?: number, mutationId?: string)
```

- [ ] **Step 1: Add household-separation tests**

Write local persistence tests proving state and pending queue for `household-a` are invisible to `household-b`. Add a legacy migration test that unscoped `state`/`sync-state-v2` data migrates only when `stateId === 'household'`.

Update remote tests to assert `.eq('id', stateId)`, RPC `requested_id: stateId`, and Realtime channel/filter names use the provided ID. Update `supabase.test.ts` so compatibility configuration may still export `sharedStateId`, but no persistence module test expects it to drive normal reads/writes.

- [ ] **Step 2: Run persistence tests red**

```bash
npm test -- src/storage.test.ts src/storage.remote.test.ts src/state/usePersistentAppState.test.ts src/supabase.test.ts
```

- [ ] **Step 3: Implement namespaced local keys**

Use:

```ts
const stateKey = (stateId: string) => `state:${stateId}`
const syncKey = (stateId: string) => `sync-state-v2:${stateId}`
const fallbackStateKey = (stateId: string) => `meal-planner-state-v1:${stateId}`
const fallbackSyncKey = (stateId: string) => `meal-planner-sync-state-v2:${stateId}`
```

For `stateId === 'household'` only, if scoped keys do not exist, import old unscoped IndexedDB/localStorage keys, write the scoped values successfully, then remove the unscoped copies. Never consult unscoped legacy keys for UUID household IDs.

`resetLocalState(stateId)` deletes only that namespace; for `household` it may additionally remove obsolete unscoped compatibility keys after successful migration.

- [ ] **Step 4: Parameterize remote/storage functions**

Remove `sharedStateId` imports from `src/persistence/remoteState.ts` and normal storage flows. Every read, CAS write, and Realtime filter receives `stateId` from its caller:

```ts
.eq('id', stateId)

await supabase.rpc('save_meal_planner_state', {
  requested_id: stateId,
  requested_state: state,
  expected_revision: expectedRevision,
  mutation_id: mutationId,
})

.channel(`meal-planner-state-${stateId}`)
```

Keep `sharedStateId` in `src/supabase.ts` only if an explicit compatibility test or transitional code path still requires it; it must not be imported by normal persistence after this task.

- [ ] **Step 5: Bind the state hook to HouseholdContext**

In `usePersistentAppState()`:

```ts
const { stateId } = useHouseholdSession()
```

Pass `stateId` through load/cache/save/subscribe calls. Make the initialization effect depend on `[stateId]`; its cleanup must unsubscribe the previous Realtime channel and invalidate in-flight work. Before loading a changed ID, clear refs/state so no pending queue from the previous namespace can be replayed.

- [ ] **Step 6: Run persistence tests green and commit**

```bash
npm test -- src/storage.test.ts src/storage.remote.test.ts src/state/usePersistentAppState.test.ts src/supabase.test.ts
git add src/persistence/localState.ts src/persistence/remoteState.ts src/storage.ts src/supabase.ts src/supabase.test.ts src/state/usePersistentAppState.ts src/storage.test.ts src/storage.remote.test.ts src/state/usePersistentAppState.test.ts
git commit -m "feat: scope planner persistence by household"
```

---

### Task 5: Add invitation redemption to AuthGate

**Files:**
- Modify: `src/AuthGate.tsx`
- Modify: `src/AuthGate.test.tsx`
- Modify: `src/households/api.ts`

**Interfaces:**
- Consumes `redeemHouseholdInvite(token, householdName)` and returns `RedeemedHousehold`.

- [ ] **Step 1: Add invite redemption tests**

Cover:
- `#invite=<token>` on an unenrolled browser shows `Household name` and `Create household`.
- no session triggers anonymous sign-in before redemption.
- successful redemption calls the RPC with trimmed household name, displays the one-time join code, then clears the hash only after success.
- invalid/expired/reused invite error keeps the fragment for retry/support.
- already-enrolled session does not redeem the token and offers `Continue to planner`.

- [ ] **Step 2: Run AuthGate tests red**

```bash
npm test -- src/AuthGate.test.tsx
```

- [ ] **Step 3: Implement fragment parsing and redemption UI**

Parse only the exact `invite` fragment key:

```ts
function inviteTokenFromHash() {
  const params = new URLSearchParams(window.location.hash.replace(/^#/, ''))
  return params.get('invite')?.trim() || null
}
```

On success:

```ts
window.history.replaceState(null, '', `${window.location.pathname}${window.location.search}`)
```

Store `joinCode` in component state until the user acknowledges it; do not persist it to localStorage/IndexedDB.

- [ ] **Step 4: Run tests green and commit**

```bash
npm test -- src/AuthGate.test.tsx
git add src/AuthGate.tsx src/AuthGate.test.tsx src/households/api.ts
git commit -m "feat: redeem household invitation links"
```

---

### Task 6: Add the admin-only invite modal

**Files:**
- Create: `src/households/InviteHouseholdModal.tsx`
- Modify: `src/App.tsx`
- Modify: `src/App.test.tsx`
- Modify: `src/styles.css`

**Interfaces:**
- Consumes `useHouseholdSession().isAdmin`.
- Consumes `createHouseholdInvite()`.
- Produces a copyable URL with `#invite=<token>` based on `new URL(import.meta.env.BASE_URL, window.location.origin)`.

- [ ] **Step 1: Add UI tests**

Assert non-admin users never see `Invite household`. For admin users, clicking it opens a modal; `Create invite` calls the RPC; returned token renders a URL under the app's configured base path; `Copy link` calls `navigator.clipboard.writeText(url)`.

- [ ] **Step 2: Run App tests red**

```bash
npm test -- src/App.test.tsx
```

- [ ] **Step 3: Implement modal and top-bar entry point**

In `App.tsx`:

```tsx
const { isAdmin } = useHouseholdSession()
const [inviteOpen, setInviteOpen] = useState(false)
```

Render a low-prominence text button beside existing top-bar actions only when `isAdmin`. The modal contains create, expiry, generated link, copy, and close controls. It must not accept/store recipient email.

Build the link as:

```ts
const url = new URL(import.meta.env.BASE_URL, window.location.origin)
url.hash = `invite=${invite.token}`
```

- [ ] **Step 4: Run App tests green and commit**

```bash
npm test -- src/App.test.tsx
git add src/households/InviteHouseholdModal.tsx src/App.tsx src/App.test.tsx src/styles.css
git commit -m "feat: add admin household invites"
```

---

### Task 7: Full regression verification and PR

**Files:**
- Review all files changed above.

**Interfaces:**
- No new interfaces; this task proves the complete expansion release is internally consistent.

- [ ] **Step 1: Run the complete automated suite**

```bash
npm test
npm run typecheck
npm run test:coverage
npm run build
```

All four commands must exit 0 before claiming the branch is merge-ready.

- [ ] **Step 2: Inspect the final diff for release-boundary mistakes**

Verify:
- no edit to already-applied migration files;
- `20260915000000_multi_household_expansion.sql` is the only new expansion migration;
- obsolete August contract file/instructions are gone;
- no secret/user/token/code literals are committed;
- `VITE_SUPABASE_STATE_ID`/`sharedStateId` is not used by normal new-client persistence;
- the old enrollment RPC and stale-client direct-write path remain legacy-household-only;
- no UUID household can read/write `state_id = 'household'` unless actually a member of the legacy household.

- [ ] **Step 3: Manual browser checks before merge**

Check narrow mobile and desktop:
1. Existing production-style enrolled legacy session opens and saves normally.
2. A retained stale legacy client still reads/writes the legacy household.
3. Admin creates an invite, copies link, and recipient opens it in an unenrolled browser.
4. Recipient names household, receives join code, acknowledges it, reloads, and sees the same isolated planner.
5. Second anonymous browser joins that new household using its code and Realtime syncs with the first.
6. Legacy household and new household never display each other's planner data.
7. Offline pending edits in one household are not replayed after changing to a different anonymous identity/household on the same origin.

- [ ] **Step 4: Open the PR**

Use title:

```text
Add isolated household invitations
```

PR body must summarize the expansion migration, invite flow, household-scoped persistence, legacy compatibility, obsolete-contract retirement, tests run, and the manual owner bootstrap step (`meal_planner_admins` insertion) required after deployment.
