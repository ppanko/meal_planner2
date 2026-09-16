# Supabase setup: anonymous household enrollment

This app does **not** use email login, Magic Links, OTPs, passwords, or third-party OAuth. Supabase anonymous auth identifies each browser/device. Household membership is enforced by server-side RPCs and RLS.

## 1. Bootstrap a new Supabase project

Open **Supabase -> SQL Editor** and run the complete `supabase/setup.sql` file.

The first run creates a bootstrap household and returns one plaintext code:

```text
household_access_code
------------------------
<random 24-character code>
```

Save that value somewhere private. The database stores only its SHA-256 hash. Re-running `setup.sql` preserves existing households, state, and members and does not rotate the code.

A fresh project starts in the contracted RPC-only versioned-sync phase because it has no stale frontend to support. An existing production project follows the expansion procedure in [`docs/VERSIONED_SYNC_ROLLOUT.md`](docs/VERSIONED_SYNC_ROLLOUT.md); do not rerun bootstrap as a substitute for migrations.

## 2. Enable anonymous sign-ins

In the Supabase Dashboard, open **Authentication -> General Configuration** and enable **Allow anonymous sign-ins**.

No email provider or redirect URL is required.

## 3. Configure and enroll the owner device

Local `.secrets` needs the browser-safe project values:

```text
VITE_SUPABASE_URL=https://YOUR_PROJECT.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=sb_publishable_YOUR_KEY
VITE_SUPABASE_STATE_ID=household
```

`VITE_SUPABASE_STATE_ID` remains only as a temporary compatibility setting during the current expansion. The multi-household client resolves its actual state ID from the authenticated household and does not use this value for normal persistence.

Then run:

```bash
npm install
npm run dev
```

On first launch, enter the bootstrap household code. The browser receives an anonymous Supabase user and becomes a member of the bootstrap household.

### Designate the sole invitation admin

After that owner browser is enrolled, identify its anonymous Supabase user ID in the Supabase dashboard. In the SQL Editor, insert that UUID into `meal_planner_admins`:

```sql
insert into public.meal_planner_admins (user_id)
values ('REPLACE_WITH_OWNER_USER_ID');
```

Do not commit or post the real UUID. This is the one manual admin-bootstrap step. No admin password or service-role key is shipped to the browser.

If the owner later loses that anonymous browser identity, admin reassignment is an explicit database-administration operation.

## 4. Creating a new household

Only the designated admin sees **Invite household** in the app.

1. Select **Invite household**.
2. Select **Create invite**.
3. Copy the one-time link and send it using your normal email or messaging app.
4. The recipient opens it on an unenrolled browser/device and enters a household name.
5. The app creates an isolated planner and shows that household's join code once.

The app does not send or store the recipient's email. Invitation links expire after seven days and can be redeemed once.

## 5. Adding another device or household member

Every household has its own join code. Open the app on the additional browser/device and enter that household's code on the normal connection screen.

That browser receives a new anonymous Supabase identity linked to the same household and therefore the same planner. It cannot read or write another household's state.

If a browser loses site data or its anonymous session, entering its household code again creates a new anonymous identity for that household.

## 6. GitHub Pages and migration secrets

Under **GitHub repository -> Settings -> Secrets and variables -> Actions**, configure:

- `SUPABASE_URL`
- `SUPABASE_PUBLISHABLE_KEY`
- `SUPABASE_STATE_ID` (temporary compatibility value: `household`)
- `SUPABASE_ACCESS_TOKEN`
- `SUPABASE_DB_PASSWORD`
- `SUPABASE_PROJECT_ID`

The browser values come from **Project -> Settings -> API**. Migration-only values are used by GitHub Actions and are never included in the browser bundle:

- `SUPABASE_ACCESS_TOKEN`: a Supabase account access token used by CI.
- `SUPABASE_DB_PASSWORD`: the project's Postgres password.
- `SUPABASE_PROJECT_ID`: the project reference.

On a push to `master`, GitHub Actions tests and builds first, previews pending migrations, applies them with `supabase db push`, and only then deploys the already-built Pages artifact. Feature-branch work must not change the production database.

The database remains in the versioned-sync `expand` phase while multi-household compatibility is being verified. The old August prepared contract has been superseded; a new later-timestamped contract migration is created only after this household-aware frontend has completed a normal production usage cycle.

## State and sync behavior

Planner state is cached locally and synchronized with version-checked Supabase writes and Realtime updates. Both server state and local IndexedDB/localStorage caches are keyed by the resolved household state ID. Pending offline edits from one household are never replayed into another household.

Legacy unscoped browser cache is migrated only into the bootstrap household (`state_id = 'household'`).

## Security notes

- Household and invitation plaintext credentials are never bundled with the app or stored in database tables; only SHA-256 hashes are stored.
- New household/admin/invite/member tables are not directly exposed to browser clients. Membership and invitation changes go through `SECURITY DEFINER` RPCs.
- Planner reads and compare-and-swap writes are authorized against the caller's resolved household.
- During the expansion window, stale direct-upsert clients remain authorized only for members of the migrated bootstrap/legacy household.
- The Supabase publishable key is expected to be public; authorization depends on RLS/RPC checks, not secrecy of that key.

Supabase recommends CAPTCHA/Turnstile for public applications using anonymous sign-ins to reduce automated account-creation abuse. For this small private deployment it remains optional rather than becoming another required service.
