# Hyperion — Frontend

Mobile-first workout tracker: build training programs, run an Active Workout
session (log sets, rest timer, PR detection), and review History and Progress.
Discover/Contribute let users share programs publicly.

This repo is the **Vue 3 SPA**. The API lives in a separate repo
([hyperion-be](https://github.com/andrawsMalallah/hyperion-be)).

## Stack

- **Vue 3** (`<script setup>` SFCs) + **Vite**
- **Vue Router** (`createWebHistory`)
- **Pinia** stores with `pinia-plugin-persistedstate`
- **Axios** (`src/api.js` — shared instance that injects the Bearer token and
  redirects to `/login` on 401)
- **Sentry** (`@sentry/vue`, errors only, enabled only when a DSN is set)
- Installable **PWA** with an offline-first workout outbox

## Prerequisites

- **Node 24 LTS** (selected by `.node-version`; minimum supported: 22.18)
- A running instance of the backend API

## Setup

```bash
npm ci
```

API base URL is read from `VITE_API_URL` at build time:
`.env.development` points at the local API, `.env.production` at the deployed one.

## Commands

| Task | Command |
| --- | --- |
| Dev server | `npx vite --host 127.0.0.1 --port 5173` |
| Production build | `npx vite build` |
| Production Node server | `npm start` (build first; defaults to port 3000) |
| Node server tests | `npm run test:server` |
| Quick compile check | `npx vite build --mode development` |
| E2E tests | `npx playwright test` |

> **Local-dev CORS note:** open the app at **`localhost:5173`**, not
> `127.0.0.1:5173` — the browser treats them as different origins and the API
> (CORS-pinned to one) will reject every call.

## Testing

End-to-end tests run under **Playwright** (`tests/`). The suite is hermetic: it
boots its own API (`:8100`) and SPA (`:5273`), so it never touches the dev ports
and can run alongside `npm run dev`. Run it locally with
`npx playwright test --workers=1`; Playwright is not run in CI or during
production deployment. CI retains the Node server HTTP tests and production
build checks.

## Project structure

```
src/
  views/         route-level pages (Home, ActiveWorkout, Progress, …)
  stores/        Pinia domain logic (workout, sync, progress, auth, …)
  components/     reusable UI (AppModal, BottomNav, RestTimer, …)
  composables/    shared behaviour (useFocusTrap, useModalLock, …)
  utils/         pure helpers (units, stats, grouping, programFile, …)
  api.js         shared axios instance
  router/        routes + auth/verification/admin guards
```

## Deploy

The primary deployment is a **Render Static Site** from `main`. Render builds
with `npm ci --include=dev && npm run build` and publishes `dist`.

See [DEPLOYMENT.md](DEPLOYMENT.md) for the exact dashboard settings, SPA rewrite,
security headers, CI enforcement, cutover and manual acceptance checks.

The `node-server` branch preserves the Node Web Service fallback. Connect the
Node service to that branch with build `npm ci --include=dev && npm run build`,
start `npm start`, and health check `/healthz`. Keep it available until static
hosting is verified. Future fixes need to reach both branches if both are used.

Keep building and retaining tracked `dist/` until its cleanup is approved.
