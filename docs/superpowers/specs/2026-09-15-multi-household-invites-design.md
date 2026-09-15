# Multi-household invitation design

## Goal

Add a minimal, admin-controlled onboarding layer that lets the app support multiple isolated households without introducing passwords, third-party identity providers, or automated email delivery.

The intended flow is:

1. A prospective user sends the app owner their email address outside the app.
2. The owner creates a one-time invitation link in an admin-only surface.
3. The owner emails that link manually.
4. The recipient opens the link, enters a household name, and submits.
5. The app creates or reuses an anonymous Supabase session, creates an isolated household and planner, enrolls that user as the household's first member, and shows the household-specific join code.
6. Additional devices or household members can later enroll with that join code using the existing enrollment concept.

The email address is not an authentication credential and is not stored by the application. It remains part of the owner's manual communication workflow.

## Constraints

- Only the app owner may create invitations.
- Admin identity is established once by inserting the owner's existing Supabase user ID into an admin table. No admin password or service key is shipped to the browser.
- Recipients do not create passwords and do not need Google, Apple, GitHub, or other third-party accounts.
- Anonymous Supabase auth remains the browser identity mechanism.
- Each anonymous user belongs to exactly one household in this implementation.
- Each household has one shared planner state and one household-specific join code.
- Invitation links are one-time and expire after seven days.
- Email delivery remains manual; no email provider is added.
- Existing household data and already-enrolled devices must remain usable throughout rollout.
- Existing local IndexedDB/localStorage data must never be replayed into a different household.
- The existing versioned-sync expand/deploy/contract compatibility rules remain in force, but the prepared August contract migration must be superseded by a later contract after this feature rather than promoted out of order.
- No real email address, user ID, join code, invite token, or Supabase secret may be committed or printed in tests/docs.

## Data model

### `meal_planner_admins`

Stores the small set of users authorized to create household invitations. Initially it contains only the app owner's current anonymous Supabase user ID.

- `user_id uuid primary key references auth.users(id) on delete cascade`
- `created_at timestamptz not null default now()`

Enable RLS and revoke all direct privileges from `anon` and `authenticated`. Invitation creation is exposed only through a security-definer RPC that checks membership in this table.

### `meal_planner_households`

Represents one isolated planner household.

- `id uuid primary key`
- `state_id text unique not null`
- `name text not null`
- `code_hash text unique not null`
- `created_at timestamptz not null default now()`

`state_id` is separate from the UUID so the existing production planner can retain its legacy state row ID, `household`, during migration. New households use their UUID string as `state_id`.

Household names are display labels only. They are not identifiers and do not need to be unique. The server trims leading/trailing whitespace, requires 1-80 characters after trimming, and rejects control characters. The client mirrors these limits for immediate feedback, but the server remains authoritative.

Enable RLS and revoke all direct privileges from `anon` and `authenticated`. Household metadata is returned only through narrowly scoped security-definer RPCs.

### `meal_planner_members`

Extend the existing table rather than replace it.

- existing `user_id uuid primary key`
- add `household_id uuid not null references meal_planner_households(id) on delete cascade`
- existing `enrolled_at`

Keeping `user_id` as the primary key deliberately enforces one household per anonymous user.

Keep RLS enabled and retain the existing no-direct-access posture. Browser clients do not read or write memberships directly; security-definer RPCs own enrollment and household lookup.

### `meal_planner_invites`

Stores one-time invitation records.

- `id uuid primary key`
- `token_hash text unique not null`
- `created_by uuid not null references auth.users(id)`
- `created_at timestamptz not null default now()`
- `expires_at timestamptz not null`
- `redeemed_at timestamptz`
- `redeemed_by uuid references auth.users(id)`
- `household_id uuid references meal_planner_households(id)`

Only a hash of the bearer token is stored. Invitation tokens use 32 cryptographically random bytes encoded as hex. The plaintext token is returned once to the admin client and placed in the invitation URL fragment.

The invite table does not store the recipient email because the application does not send or verify email.

Enable RLS and revoke all direct privileges from `anon` and `authenticated`. Invite creation and redemption occur only through security-definer RPCs.

## Legacy household migration

The expansion migration creates one `meal_planner_households` row for the existing planner. Its `state_id` is `household`.

The legacy household's `code_hash` is copied from `meal_planner_access.code_hash` for the existing `id = 'household'` row. The source access row/table remains unchanged during expansion so the old deployed enrollment RPC continues to work.

All existing `meal_planner_members` rows are backfilled to that legacy household before `household_id` becomes non-null.

No existing state row is copied or renamed. The production row with `meal_planner_state.id = 'household'` remains in place.

### Legacy-client authorization during expansion

The stale-client compatibility path must be narrowed at the same time households are introduced.

`is_meal_planner_authorized()` remains available for the old deployed client, but during multi-household expansion it means specifically:

> the current authenticated user is a member of the migrated legacy household whose `state_id = 'household'`.

It must not mean merely that the user belongs to any household.

The temporary direct-write insert/update policies and `guard_legacy_meal_planner_write()` must use this legacy-household-specific check. Therefore:

- an existing legacy-household member running a stale client can still read and write `id = 'household'` during the compatibility window;
- a member of a newly created household running a stale cached client fails the legacy authorization check and cannot read or write the original household state;
- the old `enroll_meal_planner_device(access_code)` RPC continues to enroll only into the legacy household and only when the caller knows the legacy household code.

This constraint is part of the security boundary and must be covered by SQL integration tests.

## Server-side RPCs

### `get_my_meal_planner_household()`

Returns the current authenticated user's household context or no row when unenrolled:

- `household_id`
- `state_id`
- `household_name`
- `is_admin`

This replaces the new client's boolean-only enrollment check. The existing `is_meal_planner_authorized()` RPC remains available during the compatibility window only for the legacy client and is scoped to legacy-household membership as described above.

### `create_meal_planner_invite()`

Admin-only security-definer RPC.

Behavior:

1. Require `auth.uid()`.
2. Require the current user to exist in `meal_planner_admins`.
3. Generate 32 cryptographically random bytes and encode them as the bearer token.
4. Store only its SHA-256 hash.
5. Set `expires_at` to seven days after creation.
6. Return the plaintext token and expiry once.

The frontend constructs the invitation URL from the current application URL. No service key is exposed.

### `redeem_meal_planner_invite(invite_token, household_name, initial_state)`

Authenticated security-definer RPC. The frontend creates an anonymous Supabase session first if one does not already exist.

Within one database transaction the function:

1. Validates and locks the invitation row by token hash.
2. Rejects expired or already-redeemed invites.
3. Rejects a user who already belongs to a household.
4. Trims and validates the household name using the 1-80 character rule above.
5. Validates `initial_state` with the existing server-side planner-state validator.
6. Creates a household UUID and a join code using the current scheme: 12 cryptographically random bytes encoded as hex.
7. Stores only the join-code SHA-256 hash.
8. Creates the first membership for `auth.uid()`.
9. Creates the household's initial `meal_planner_state` row using the household `state_id`, revision 1, and the same server-side state protections used by normal writes.
10. Marks the invite redeemed and records the resulting household.
11. Returns the household context and plaintext join code once.

If any step fails, the transaction rolls back all changes.

### `enroll_meal_planner_household(access_code)`

Authenticated security-definer RPC for subsequent devices/people.

It hashes the submitted code, finds the matching household by `code_hash`, rejects users already enrolled elsewhere, inserts membership, and returns the resolved household context.

The current `enroll_meal_planner_device(access_code)` remains temporarily for old-client compatibility and continues to enroll into the legacy household only.

## State authorization

Introduce a server-side helper equivalent to:

`can_access_meal_planner_state(requested_state_id text)`

It returns true only when `auth.uid()` belongs to the household whose `state_id` equals the requested row ID.

Update the state read policy and `save_meal_planner_state()` to use this household-scoped check rather than the current global authorization plus `id = 'household'` assumption.

The old legacy client remains compatible because its enrolled users belong to the migrated legacy household and still request state ID `household` through the separately constrained legacy compatibility path.

State validation, compare-and-swap revisions, mutation idempotency, history retention, and realtime behavior remain unchanged except that authorization is now scoped to the requested household state.

No direct browser grant is added for the new household/admin/invite/member tables. The only normal direct table read remains the RLS-protected planner-state select required by the sync client.

## Client architecture

### Household session

`AuthGate` resolves a household context rather than a boolean enrollment result. The authenticated portion of the app receives at least:

- `householdId`
- `stateId`
- `householdName`
- `isAdmin`

Provide this through a small household-session React context owned by `AuthGate`, so `App`, the admin invite control, and persistence hooks consume the same resolved identity without prop-drilling.

The persistence layer stops importing a build-time global state ID for normal operation. Remote reads, writes, and realtime subscriptions are parameterized by the resolved `stateId`.

The legacy `VITE_SUPABASE_STATE_ID` setting can remain only as a temporary compatibility/configuration fallback during the staged rollout and should be removed in the later contract cleanup when no deployed client depends on it.

### Household-scoped local persistence

Current IndexedDB/localStorage keys are global to the browser origin. Multi-household support must scope all cached state and pending sync data to the resolved `stateId` before loading any planner data.

Use household-specific keys, for example:

- IndexedDB/local fallback state: `state:<stateId>`
- sync snapshot/pending queue: `sync-state-v2:<stateId>`
- localStorage fallbacks use the same state-specific suffixing

The exact string format may differ, but both working state and the complete pending-change queue must share the same household namespace.

Legacy cache migration is deliberately one-way and legacy-only:

1. After `AuthGate` resolves `stateId = 'household'`, check for the new scoped legacy-household cache.
2. If no scoped cache exists, import the old unscoped `state`, `sync-state-v2`, `meal-planner-state-v1`, and `meal-planner-sync-state-v2` data into the `household` namespace.
3. Remove the old unscoped keys after successful migration.
4. Never import an unscoped legacy cache when the resolved `stateId` is anything other than `household`.

A browser that later presents a different anonymous user therefore cannot accidentally load or replay the previous household's pending local edits into the newly resolved household.

`loadLocalState`, `cacheState`, `loadLocalSyncSnapshot`, `cacheLocalSyncSnapshot`, `hasStoredLocalState`, and `resetLocalState` must all receive or derive the household namespace explicitly. Tests must exercise household separation and pending-queue separation, not only server isolation.

### Invitation URLs

Use the URL fragment rather than a query parameter, for example:

`https://<pages-app>/#invite=<token>`

The fragment is available to the browser application but is not sent to GitHub Pages in the HTTP request and is not included in normal HTTP referrer data. This reduces unnecessary exposure of the bearer token while avoiding a router and GitHub Pages deep-link 404 behavior.

The app reads the token from `window.location.hash`. After successful redemption, remove the fragment with `history.replaceState` so the token is not retained in copied URLs or browser history. If anonymous sign-in fails before redemption, leave the fragment intact so the operation can be retried.

### Admin invite surface

When `isAdmin` is true, add a low-prominence `Invite household` text button to the existing top-bar actions. It opens a small modal containing only:

- Create invite button
- expiry display
- copyable invitation link
- close control

The button is absent for non-admin users. No recipient email input is required because the application is not responsible for sending email.

### Invite redemption surface

When an `#invite=<token>` fragment is present and the user is not enrolled, show a focused screen containing:

- Household name
- Create household button
- concise invalid/expired/reused invite error state

If there is no Supabase session, create an anonymous session before redemption.

If the current anonymous user is already enrolled in a household, do not redeem or discard the invite. Show a clear message that this device is already connected to that household and that invitation links must be opened on an unenrolled browser/device. Provide a simple action to continue to the current planner. Household switching/sign-out UX is out of scope.

On successful redemption, show the newly generated household join code prominently once, with a copy action and a clear note that it is used to connect another device or household member. Continue into the planner after acknowledgement.

### Existing enrollment surface

Keep the current household-code form and copy, but call the new household enrollment RPC. Successful enrollment returns the household context used to start the app.

## Error and recovery behavior

- Invalid, expired, or already-redeemed invitation: show a non-destructive error and do not create a household.
- Failed anonymous sign-in: retain the invitation fragment and show the Supabase error.
- Failed household redemption: leave the invitation unredeemed unless the transaction completed.
- Invite opened by an already-enrolled user: preserve the invite fragment, do not redeem it, and explain that it must be opened on an unenrolled device/browser.
- Invalid join code: preserve the current simple invalid-code behavior.
- User already enrolled in another household: reject both invitation redemption and code enrollment rather than silently switching households.
- Lost browser identity: the user can reconnect using their household join code, matching the current recovery model.
- Lost household join code: no self-service recovery is added in this scope. An admin/recovery feature can be added separately if usage justifies it.
- Changing household identity must never cause unscoped local state or pending edits to be loaded into the newly resolved household.

## Rollout

This feature must be layered onto the currently deployed versioned-sync expansion without invalidating the old client.

### Release sequence

1. **Keep the database in the existing `versioned_sync = 'expand'` phase.** Do not promote `supabase/contracts/20260819020000_contract_versioned_sync.sql`.
2. Add a new, later-timestamped multi-household expansion migration that:
   - introduces households, admins, invites, member backfill, household-aware authorization, and new RPCs;
   - narrows `is_meal_planner_authorized()`, the temporary direct-write policies, and `guard_legacy_meal_planner_write()` to legacy-household members only;
   - preserves old enrollment into the legacy household;
   - preserves direct-write compatibility for legacy-household stale clients only.
3. Update `supabase/setup.sql` so a fresh project receives the current multi-household schema.
4. Update the frontend to resolve its household dynamically, scope remote and local persistence by `stateId`, and support admin invites/redemption.
5. Deploy the expansion migration and new frontend using the existing build-before-migrate-before-deploy safety workflow.
6. Verify in production:
   - existing legacy household read/write/reload;
   - intentionally retained stale legacy client read/write;
   - stale client under a newly created household is denied legacy state access;
   - new invite creation/redemption;
   - join-code enrollment;
   - household-local IndexedDB separation;
   - two-client realtime sync and normal CAS saves in both legacy and new households.
7. Leave this expanded compatibility state in place for at least one normal usage cycle.
8. After the multi-household frontend is confirmed, create a **new later-timestamped contract migration** that performs the versioned-sync contract cleanup plus any obsolete single-household cleanup required by this feature.

### Superseding the prepared August contract

`supabase/contracts/20260819020000_contract_versioned_sync.sql` must not later be moved into `supabase/migrations/` after a September multi-household migration has shipped. Its timestamp and assumptions predate the multi-household expansion.

During implementation, mark that prepared contract as superseded and replace it with a new contract file whose timestamp is later than the multi-household expansion. The replacement contract should include the still-valid cleanup from the August contract—revoking temporary direct writes, dropping temporary write policies/trigger, and moving the release marker to `contract`—but against the household-aware schema and compatibility helpers that actually exist after this feature.

No already-applied immutable migration is edited.

## Fresh-project bootstrap

A fresh `supabase/setup.sql` installation should still create one bootstrap/legacy household with `state_id = 'household'` and generate its initial household join code exactly once. This preserves the current first-device setup model and gives the app owner a household before invitation administration exists.

A fresh setup does not pre-populate `meal_planner_admins`, because there is no authenticated owner user at SQL bootstrap time.

The owner bootstrap flow is therefore:

1. Run `supabase/setup.sql` and save the generated bootstrap household code.
2. Open the app and enroll the owner device with that code.
3. Identify that enrolled Supabase user ID in the Supabase dashboard.
4. Insert that UUID into `meal_planner_admins` using the SQL editor.
5. From then on, create new households through the admin invite UI.

The bootstrap household's access hash is also represented in `meal_planner_households.code_hash`; the compatibility `meal_planner_access` row remains only while the old-client expansion path exists.

## One-time owner setup for the existing production project

After the multi-household expansion schema exists, the owner identifies the Supabase user ID corresponding to the currently enrolled owner device in the Supabase dashboard and inserts that UUID into `meal_planner_admins` using the SQL editor.

This is the only manual admin bootstrap step. The UUID must never be committed to the repository.

If the owner later loses that anonymous browser identity, admin reassignment is an explicit database administration action; it is not recovered through a public client secret.

## Testing

### SQL/integration tests

Extend the existing PGlite Supabase SQL tests to cover:

- migration of existing members into the legacy household
- copy of the legacy access hash into the legacy household
- all new household/admin/invite/member tables have RLS enabled and no unintended direct browser privileges
- old `is_meal_planner_authorized()` authorizes legacy-household members only
- old enrollment RPC still enrolling only into the legacy household during expansion
- temporary direct-write policy and trigger permit a stale legacy-household client
- temporary direct-write policy and trigger deny a new-household member attempting `id = 'household'`
- only a designated admin can create invitations
- invitation token hashes are stored instead of plaintext
- seven-day expiration enforcement
- one-time redemption and replay rejection
- atomic rollback on redemption failure
- household-name validation
- one-household-per-user enforcement
- household join-code enrollment
- cross-household state reads denied by RLS
- cross-household state saves denied by RPC
- valid save/conflict/replay behavior preserved within each household
- initial state validation during invitation redemption
- fresh bootstrap creates the legacy/bootstrap household and matching access hash without creating an admin automatically

### Client/local-persistence tests

Cover:

- existing enrolled session opens the correct household
- invite fragment shows redemption UI
- anonymous session creation before redemption
- successful redemption resolves the new household and clears the fragment from the URL
- invalid/expired/reused invite errors
- invite opened by an already-enrolled user is not redeemed or discarded
- household-name validation
- join code resolves the correct household
- admin invite control visible only to the designated admin
- persistence uses the resolved household `stateId` for read/write/realtime
- state cache for household A is not loaded for household B
- pending sync queue for household A is not replayed for household B
- legacy unscoped IndexedDB/localStorage data migrates only into `stateId = 'household'`
- unscoped legacy data is never imported into a new UUID household
- reset/has-stored-state operations affect only the requested household namespace
- existing mobile and desktop enrollment presentation remains usable

### Verification before merge

Run focused tests while implementing, then:

- `npm test`
- `npm run typecheck`
- `npm run test:coverage`
- `npm run build`

Because this changes schema, auth, deployment compatibility, PWA onboarding, and local persistence, also perform manual narrow-mobile and desktop checks for legacy enrollment, invite redemption, join-code enrollment, reload persistence, household cache separation, and two-client realtime sync.

## Explicitly out of scope

- Automated invitation email delivery
- Email verification
- Password accounts
- Google/Apple/GitHub OAuth
- Household switching or one user belonging to multiple households
- Admin delegation
- Household/member management UI
- Join-code rotation/recovery UI
- Invite revocation/list management beyond expiry and single-use semantics
- Billing or commercial account tiers
