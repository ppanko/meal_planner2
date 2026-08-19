# Meal Planner

A mobile-first, local-only meal planner built with React and TypeScript.

## Features

- 7 × 3 weekly planner (Breakfast/Lunch/Dinner × Monday–Sunday)
- Drag meals onto calendar cells
- Tap a meal to put it in the next available slot
- Double-click a planned meal to remove it
- Meal library divided into breakfast, lunch, and dinner
- Create and edit meals from ingredient lists
- Create reusable ingredients
- Automatic weekly shopping list with quantities combined
- Check off shopping items
- Week navigation
- Persistent local data using IndexedDB
- No backend, account, or cloud database
- PWA/offline support
- GitHub Pages deployment via GitHub Actions

## Local development on Linux

Requirements: Node.js 22 or newer.

```bash
npm install
npm run dev
```

Open the URL printed by Vite.

Production build:

```bash
npm run build
npm run preview
```

## Testing

The test suite uses Vitest, Testing Library, jsdom, and an in-memory IndexedDB implementation. Tests are colocated with the source files they cover.

```bash
npm test                # run the complete suite once
npm run test:watch      # rerun affected tests while developing
npm run test:coverage   # enforce coverage thresholds and write coverage/ reports
npm run typecheck       # strict TypeScript check, including tests
```

The suite covers domain utilities, state migrations, local and Supabase persistence, realtime updates, feature controllers, authentication, UI interactions, and top-level application wiring. Supabase and browser boundaries are mocked; no live project or household code is needed to run tests.

## GitHub Pages deployment

1. Create a GitHub repository and push this project to the `main` branch.
2. In GitHub, open **Settings → Pages**.
3. Under **Build and deployment → Source**, select **GitHub Actions**.
4. Push to `main` (or run the workflow manually).
5. GitHub will publish the `dist/` directory.

The Vite configuration uses a relative base, so the application works at a GitHub Pages project URL without changing the source code.

## iPhone

Open the GitHub Pages URL in Safari and use **Share → Add to Home Screen**. If iOS offers **Open as Web App**, enable it.

The application stores its data in IndexedDB on the device. The GitHub Pages site only supplies the application files; meal data is not sent to a server.

The service worker caches the application so it can continue to work when offline after it has been loaded once.

## Data

Data is local to the browser/device. Clearing the site's browser data will remove the stored meal planner data. The app also migrates data from the previous localStorage version if it finds it.


## Developer configuration

This build uses a local `.secrets` file instead of hard-coded values.

```bash
cp .secrets.example .secrets
```

Fill in `.secrets`, then run `npm run dev`. The file is gitignored.

For GitHub Pages, configure the corresponding GitHub Actions repository secrets;
the deployment workflow injects them automatically.

### Node types for Vite config

`vite.config.ts` reads `.secrets` at build time, so the project includes
`@types/node` and enables Node types in `tsconfig.node.json`.


## Authentication

The current build uses **anonymous device enrollment with a household code**.
It does not send emails.

Run `supabase/setup.sql`, save the generated household access code, and enable
**Allow anonymous sign-ins** in Supabase Authentication settings. Each device
enters the code once; the session then persists locally.
