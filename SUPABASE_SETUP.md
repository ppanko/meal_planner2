# Supabase setup for Meal Planner

This version requires **no source-code substitutions**.

Local developer values live in `.secrets`. GitHub Pages builds use GitHub
repository secrets with the same values.

## 1. Create the Supabase project

Create a free Supabase project.

From **Project Settings / API** (or the Connect dialog), copy:

- Project URL
- Publishable key (`sb_publishable_...`)

Do **not** use a Supabase secret key or `service_role` key in this app.

## 2. Configure the database

Open **SQL Editor** in Supabase and run `supabase/setup.sql` unchanged.

Then open **Table Editor -> meal_planner_authorized_users** and insert the two
email addresses that are allowed to use the planner.

Store them in lowercase, for example:

- `person1@example.com`
- `person2@example.com`

These rows are the real server-side authorization list used by RLS.

## 3. Configure passwordless login

In **Authentication -> URL Configuration**:

- set your GitHub Pages URL as an allowed Redirect URL;
- for local development, also allow your Vite development URL, usually
  `http://localhost:5173/`.

For a GitHub Pages project site, the production URL is usually:

`https://USERNAME.github.io/REPOSITORY/`

## 4. Local development: create `.secrets`

Copy:

```bash
cp .secrets.example .secrets
```

Then edit **only `.secrets`**:

```text
VITE_SUPABASE_URL=https://YOUR_PROJECT.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=sb_publishable_YOUR_KEY
VITE_ALLOWED_EMAILS=person1@example.com,person2@example.com
VITE_SUPABASE_STATE_ID=household
```

`.secrets` is ignored by Git and is read automatically by `vite.config.ts`.

Then:

```bash
npm install
npm run dev
```

No TypeScript/SQL source file needs editing.

## 5. GitHub Pages: add repository secrets

Because your local `.secrets` is intentionally not committed, GitHub Actions
uses repository secrets instead.

In GitHub:

**Repository -> Settings -> Secrets and variables -> Actions -> New repository secret**

Create:

- `SUPABASE_URL`
- `SUPABASE_PUBLISHABLE_KEY`
- `ALLOWED_EMAILS`
- `SUPABASE_STATE_ID`

Use the same values as `.secrets`.

The deployment workflow passes these into Vite at build time automatically.

## 6. First shared-data migration

Use the device/browser that currently contains your existing meal-planner data
first.

After signing in, if the shared Supabase row does not yet exist, the app uses
the existing IndexedDB state to seed it.

After that, the second authorized device signs in and receives the shared
state.

## Security notes

- `.secrets` keeps configuration out of your repository, which is convenient
  for development.
- Values used by browser JavaScript are still present in the compiled browser
  bundle. This is expected for the Supabase **publishable** key.
- Never put a Supabase secret/service-role key in `.secrets` for this frontend.
- The actual protection is Supabase Auth + RLS.
- `VITE_ALLOWED_EMAILS` is only a client-side convenience check.
- `meal_planner_authorized_users` is the authoritative server-side allowlist.
