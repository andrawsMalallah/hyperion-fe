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
and can run alongside `npm run dev`. It also runs in CI on every push.

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

The existing production service is still a **Render Static Site**, serving the
committed `dist/`. Keep rebuilding and committing `dist/` until the replacement
Node Web Service has been verified and traffic has moved.

### Prepared Node Web Service

Create a Render **Web Service** connected to `andrawsMalallah/hyperion-fe`, with:

| Setting | Value |
| --- | --- |
| Branch | `main` |
| Language | Node |
| Root directory | blank |
| Build command | `npm ci --include=dev && npm run build` |
| Start command | `npm start` |
| Health check path | `/healthz` |
| Auto-deploy | After CI checks pass |

The server binds to `0.0.0.0` and Render's `PORT` (3000 locally). Render selects
Node 24 from `.node-version`; remove any stale dashboard `NODE_VERSION` override
or set it to the current Node 24 LTS release. No publish directory or static-site
rewrite rule is needed. Free web services sleep after 15 idle minutes.

Vite still creates `dist/`, but the new service builds it on every deployment.
The server uses `sirv` for static files and Vue Router deep-link fallback. It
serves the CSP, `nosniff` and referrer headers itself, using a hidden header file
generated alongside the build from its API and Sentry origins. HTML, the service
worker and other unversioned files revalidate; fingerprinted assets are immutable.

Keep the current service available while testing the replacement. A new frontend
origin requires updating the backend's Render `FRONTEND_URL` for CORS and emailed
links. Test login, direct `/history` and `/builder/...` refreshes, password-reset
and email-verification links, and the installed PWA before retiring the old site.
Keeping the same custom domain preserves browser storage and the PWA origin;
switching to a different `onrender.com` URL does not transfer local sessions or
offline workouts. Back up any pending workouts before changing origin.

After cutover, tracked `dist/` can be removed in a separately approved cleanup.

## More

See `CLAUDE.md` in this repo for the full architecture, conventions, and the
pre-deploy checklist.
