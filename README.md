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
