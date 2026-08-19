# AGENTS.md

## Project overview

Meal Planner is a mobile-first React 19 + TypeScript PWA built with Vite. It manages a weekly planner, reusable meals and ingredients, and a generated shopping list. State is cached locally in IndexedDB and synchronized as one JSON document through Supabase Realtime. Access is protected by anonymous Supabase sessions enrolled with a household code.

## Repository map

- `src/App.tsx`: top-level view selection, controller wiring, drag-and-drop context, modals, and undo UI.
- `src/AuthGate.tsx`: anonymous-session enrollment and authorization checks.
- `src/types.ts`: canonical persisted-state and domain types.
- `src/data.ts`: seed data and default domain values.
- `src/storage.ts`: state normalization/migrations, IndexedDB fallback, Supabase reads/writes, and realtime subscription.
- `src/supabase.ts`: browser Supabase client and build-time configuration.
- `src/state/`: persistent React state and undo handling.
- `src/planner/`, `src/meals/`, `src/shopping/`: feature views, controllers, and pure utilities.
- `src/utils/`: shared date and text helpers.
- `src/test/`: shared test setup and fixtures; feature tests are colocated as `*.test.ts(x)`.
- `src/styles.css`: global styles and responsive breakpoints.
- `public/`: web manifest, icons, and network-first service worker.
- `supabase/setup.sql`: database schema, enrollment RPCs, RLS policies, and realtime setup.
- `.github/workflows/deploy.yml`: GitHub Pages build and deployment from `master`.

## Setup and commands

Use Node.js 22 or newer.

```bash
npm install
cp .secrets.example .secrets
npm run dev
```

Fill `.secrets` with the Supabase URL, publishable key, and shared state ID. The app deliberately shows a setup screen when Supabase is not configured. Never commit `.secrets` or real household access codes.

Available checks:

```bash
npm run typecheck   # strict TypeScript project check
npm test            # complete Vitest suite, once
npm run test:watch  # Vitest in watch mode
npm run test:coverage # tests plus enforced coverage thresholds
npm run build       # typecheck plus production Vite build
npm run preview     # serve the production build locally
```

There is no lint script. For code changes, run the relevant focused tests while iterating, then `npm test` and `npm run typecheck`. Run `npm run test:coverage` when changing test scope or coverage configuration. Run `npm run build` for changes that affect configuration, deployment, dependencies, PWA assets, or release behavior.

## Architecture and data rules

- Treat `AppState` in `src/types.ts` as persisted public data, not transient component state.
- When adding or changing a persisted field, update all of the following together:
  - the type in `src/types.ts`;
  - defaults in `src/data.ts` when applicable;
  - backward-compatible handling in `normalizeState()` in `src/storage.ts`;
  - every controller or utility that reads, copies, deletes, or derives that field.
- `normalizeState()` must continue accepting older and partially populated state. Do not assume newly added properties exist in IndexedDB or Supabase.
- Keep updates immutable and route persisted changes through `update()` or `updateWithUndo()`. Use `updateWithUndo()` for user-visible destructive actions that should be reversible.
- Supabase stores the entire state object in a single `meal_planner_state` row. Writes are last-write-wins; avoid extra saves and do not introduce mutations that can race with the realtime subscription.
- Local persistence is intentionally written before remote persistence so the app remains usable during network failures. Preserve the IndexedDB/localStorage fallback behavior.
- Planner day keys use local `YYYY-MM-DD` strings from `dateKey()`. Weeks start on Monday, and week-scoped records use the Monday key.
- Planner cells contain arrays of meal IDs and are limited to three meals. Preserve this invariant in UI actions, drag-and-drop code, copies, and migrations.
- The shopping list is derived from planned meal ingredients. Purchased quantities, manual items, notes, custom rows, and history have separate week/global storage; do not conflate generated and manual items.
- Keep IDs stable once persisted. Existing references from meals, planner entries, shopping history, and category assignments depend on them.

## Code conventions

- Follow the existing strict TypeScript style: single quotes, no semicolons, trailing commas in multiline constructs, and `import type` for type-only imports.
- Use function components and hooks. Keep feature orchestration in `use*Controller` hooks and put reusable calculations in pure utility functions.
- Prefer explicit immutable array/object transformations over in-place mutation. Deep-copy only the nested persisted structures that require it.
- Keep domain types centralized in `src/types.ts`; keep component-only prop and display types near their component.
- Reuse existing date, slug, planner, protein, and shopping helpers before adding duplicate logic.
- Add UI styling to `src/styles.css`, reuse the existing CSS variables, and verify both desktop and the `900px`/`500px` mobile layouts.
- Preserve accessible labels, button types, dialog semantics, focus behavior, and touch interactions. Planner changes should work with both pointer drag-and-drop and the mobile tap flow.
- Avoid adding a dependency when a small local helper is sufficient. If dependencies change, update `package-lock.json` with `package.json`.

## Manual verification

Choose checks relevant to the change, including both desktop and a narrow mobile viewport:

- Enrollment: a saved authorized session opens the app; invalid household codes show an error.
- Planner: add by click/tap and drag, remove, edit notes, add/remove custom rows, navigate weeks, copy a week, clear a week, and undo destructive actions.
- Meals: create, edit, duplicate, and delete meals; manage ingredients and protein categories without leaving dangling references.
- Shopping: quantities combine across planned meals, purchased amounts remain correct as plans change, manual/history items work, and category assignment/order/deletion stays consistent.
- Persistence: reload after editing, verify offline/local fallback when relevant, and verify a second client receives realtime state for sync changes.
- PWA: when touching `public/`, service-worker registration, paths, or Vite `base`, test the production build from a non-root path because GitHub Pages uses relative URLs.

## Test conventions

- Colocate tests beside production modules using `*.test.ts` or `*.test.tsx`; put only reusable setup and fixtures in `src/test/`.
- Prefer user-visible queries and interactions from Testing Library for components. Test pure calculations and controller state transitions directly where UI rendering adds no value.
- Mock Supabase at the module boundary. Tests must never require network access, real credentials, or a live household row.
- Use `createAppState()` from `src/test/fixtures.ts` for complete state and override only fields relevant to the case.
- Keep dates deterministic with explicit local `Date` values or fake timers. Planner behavior depends on local Mondays and must not rely on the machine's current date.
- Every regression fix should include a test that fails before the fix. Every persisted-state change needs migration tests for missing and legacy fields.
- Coverage gates are configured in `vitest.config.ts`. Do not lower them to make a change pass; add meaningful coverage or explicitly justify an exclusion.

## Supabase and deployment

- Treat `SUPABASE_SETUP.md` and `supabase/setup.sql` as the source of truth for the current household-code flow. `.env.example` contains remnants of the older email allow-list configuration; do not reintroduce that flow unless explicitly requested.
- Authorization must be enforced by database RLS/RPCs, never only by browser code. The publishable key may be public; the household code must not be embedded in the bundle.
- Preserve existing shared state and enrolled devices when editing `supabase/setup.sql`; setup should remain safe to rerun.
- If changing required Vite variables, update `vite.config.ts`, `src/vite-env.d.ts`, `.secrets.example`, the deployment workflow, and setup documentation together.
- Vite uses `base: './'` for GitHub Pages project URLs. Do not change it without validating asset, manifest, and service-worker paths.

## Working-tree hygiene

- Inspect `git status` before editing and preserve unrelated user changes.
- Keep changes scoped to the request; do not rewrite seed data, SQL, or persisted-state migrations incidentally.
- Do not commit generated `dist/`, local secrets, logs, or dependency directories.
