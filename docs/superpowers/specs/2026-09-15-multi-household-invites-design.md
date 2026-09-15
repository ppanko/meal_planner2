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

The email address is not an authentication credential and does not need to be stored by the application. It remains part of the owner's manual communication workflow.

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
- The existing versioned-sync expand/deploy/contract compatibility rules remain in force.
- No real email address, user ID, join code, invite token, or Supabase secret may be committed or printed in tests/docs.

## Data model

### `meal_planner_admins`

Stores the small set of users authorized to create household invitations. Initially it contains only the app owner's current anonymous Supabase user ID.

- `user_id uuid primary key references auth.users(id) on delete cascade`
- `created_at timestamptz not null default now()`

The table is not directly writable by browser clients. Invitation creation is exposed only through a security-definer RPC that checks membership in this table.

### `meal_planner_households`

Represents one isolated planner household.

- `id uuid primary key`
- `state_id text unique not null`
- `name text not null`
- `code_hash text not null`
- `created_at timestamptz not null default now()`

`state_id` is separate from the UUID so the existing production planner can retain its legacy state row ID, `household`, during migration. New households use their UUID string as `state_id`.

Household names are display labels only. They are not identifiers and do not need to be unique.

### `meal_planner_members`

Extend the existing table rather than replace it.

- existing `user_id uuid primary key`
- add `household_id uuid not null references meal_planner_households(id) on delete cascade`
- existing `enrolled_at`

Keeping `user_id` as the primary key deliberately enforces one household per anonymous user.

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

Only a hash of the bearer token is stored. The plaintext token is returned once to the admin client and placed in the invitation URL.

The invite table does not store the recipient email because the application does not send or verify email.

## Legacy household migration

The expansion migration creates one `meal_planner_households` row for the existing planner. Its `state_id` is `household`.

All existing `meal_planner_members` rows are backfilled to that legacy household before `household_id` becomes non-null.

The current shared household access hash remains valid for the legacy household. During the expansion window, the old enrollment RPC and old deployed client continue to work for the legacy household.

No existing state row is copied or renamed. The production row with `meal_planner_state.id = 'household'` remains in place.

## Server-side RPCs

### `get_my_meal_planner_household()`

Returns the current authenticated user's household context or no row when unenrolled:

- `household_id`
- `state_id`
- `household_name`
- `is_admin`

This replaces the new client's boolean-only enrollment check. The existing `is_meal_planner_authorized()` RPC remains available during the compatibility window for old clients.

### `create_meal_planner_invite()`

Admin-only security-definer RPC.

Behavior:

1. Require `auth.uid()`.
2. Require the current user to exist in `meal_planner_admins`.
3. Generate a cryptographically random bearer token.
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
4. Validates and normalizes the household name constraints.
5. Validates `initial_state` with the existing server-side planner-state validator.
6. Creates a household UUID and random household join code.
7. Stores only the join-code hash.
8. Creates the first membership for `auth.uid()`.
9. Creates the household's initial `meal_planner_state` row using the household `state_id`, revision 1, and the same server-side state protections used by normal writes.
10. Marks the invite redeemed and records the resulting household.
11. Returns the household context and plaintext join code once.

If any step fails, the transaction rolls back all changes.

### `enroll_meal_planner_household(access_code)`

Authenticated security-definer RPC for subsequent devices/people.

It hashes the submitted code, finds the matching household, rejects users already enrolled elsewhere, inserts membership, and returns the resolved household context.

The current `enroll_meal_planner_device(access_code)` remains temporarily for old-client compatibility and continues to enroll into the legacy household only.

## State authorization

Introduce a server-side helper equivalent to:

`can_access_meal_planner_state(requested_state_id text)`

It returns true only when `auth.uid()` belongs to the household whose `state_id` equals the requested row ID.

Update the state read policy and `save_meal_planner_state()` to use this household-scoped check rather than the current global authorization plus `id = 'household'` assumption.

The old legacy client remains compatible because its enrolled users belong to the migrated legacy household and still request state ID `household`.

State validation, compare-and-swap revisions, mutation idempotency, history retention, and realtime behavior remain unchanged except that authorization is now scoped to the requested household state.

## Client architecture

### Household session

`AuthGate` resolves a household context rather than a boolean enrollment result. The authenticated portion of the app receives at least:

- `householdId`
- `stateId`
- `householdName`
- `isAdmin`

The persistence layer stops importing a build-time global state ID for normal operation. Remote reads, writes, and realtime subscriptions are parameterized by the resolved `stateId`.

The legacy `VITE_SUPABASE_STATE_ID` setting can remain only as a temporary compatibility/configuration fallback during the staged rollout and should be removed in the later contract cleanup when no deployed client depends on it.

### Invitation URLs

Use a query parameter rather than a path route, for example:

`https://<pages-app>/?invite=<token>`

This avoids adding a router and avoids GitHub Pages deep-link 404 behavior.

After successful redemption, remove the invite token from the visible URL with `history.replaceState` so it is not retained unnecessarily in copied URLs or browser history.

### Admin invite surface

Expose a small admin-only control only when `isAdmin` is true. It needs only:

- Create invite button
- expiry display
- copyable invitation link

No recipient email input is required because the application is not responsible for sending email.

The surface should be placed in an existing low-prominence management/settings area rather than adding a new primary navigation tab.

### Invite redemption surface

When an `invite` query parameter is present and the user is not already enrolled, show a focused screen containing:

- Household name
- Create household button
- concise invalid/expired/reused invite error state

If there is no Supabase session, create an anonymous session before redemption.

On success, show the newly generated household join code prominently once, with a copy action and a clear note that it is used to connect another device or household member. Continue into the planner after acknowledgement.

### Existing enrollment surface

Keep the current household-code form and copy, but call the new household enrollment RPC. Successful enrollment returns the household context used to start the app.

## Error and recovery behavior

- Invalid, expired, or already-redeemed invitation: show a non-destructive error and do not create a household.
- Failed anonymous sign-in: retain the invitation token in the current URL and show the Supabase error.
- Failed household redemption: leave the invitation unredeemed unless the transaction completed.
- Invalid join code: preserve the current simple invalid-code behavior.
- User already enrolled in another household: reject both invitation redemption and code enrollment rather than silently switching households.
- Lost browser identity: the user can reconnect using their household join code, matching the current recovery model.
- Lost household join code: no self-service recovery is added in this scope. An admin/recovery feature can be added separately if usage justifies it.

## Rollout

This feature is an expansion release and must not invalidate the currently deployed client.

1. Add a new immutable migration that introduces households, admins, invites, member backfill, household-aware authorization, and new RPCs while preserving the old enrollment RPC and legacy state ID behavior.
2. Update `supabase/setup.sql` so a fresh project receives the current multi-household schema.
3. Deploy the new frontend that resolves its household dynamically and uses household-scoped persistence.
4. Verify the legacy household, new invite creation/redemption, join-code enrollment, realtime sync, and normal saves in production.
5. Only after a stable usage cycle, add a separate contract migration that removes obsolete single-household compatibility paths and the build-time state-ID assumption.

The existing versioned-sync contract rollout must be reconciled with this sequence rather than bypassed. No existing immutable migration is edited.

## One-time owner setup

After the expansion schema exists, the owner identifies the Supabase user ID corresponding to the currently enrolled owner device in the Supabase dashboard and inserts that UUID into `meal_planner_admins` using the SQL editor.

This is the only manual admin bootstrap step. The UUID must never be committed to the repository.

If the owner later loses that anonymous browser identity, admin reassignment is an explicit database administration action; it is not recovered through a public client secret.

## Testing

### SQL/integration tests

Extend the existing PGlite Supabase SQL tests to cover:

- migration of existing members into the legacy household
- old `is_meal_planner_authorized()` behavior for the legacy client
- old enrollment RPC still enrolling only into the legacy household during expansion
- only a designated admin can create invitations
- invitation token hashes are stored instead of plaintext
- seven-day expiration enforcement
- one-time redemption and replay rejection
- atomic rollback on redemption failure
- one-household-per-user enforcement
- household join-code enrollment
- cross-household state reads denied by RLS
- cross-household state saves denied by RPC
- valid save/conflict/replay behavior preserved within each household
- initial state validation during invitation redemption

### Client tests

Cover:

- existing enrolled session opens the correct household
- invite query parameter shows redemption UI
- anonymous session creation before redemption
- successful redemption resolves the new household and clears the token from the URL
- invalid/expired/reused invite errors
- join code resolves the correct household
- admin invite control visible only to the designated admin
- persistence uses the resolved household `stateId` for read/write/realtime
- existing mobile and desktop enrollment presentation remains usable

### Verification before merge

Run focused tests while implementing, then:

- `npm test`
- `npm run typecheck`
- `npm run build`

Because this changes schema, auth, deployment compatibility, and PWA onboarding, also perform manual narrow-mobile and desktop checks for legacy enrollment, invite redemption, join-code enrollment, reload persistence, and two-client realtime sync.

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
