# Render deployment

## Branches and services

- `main`: Render Static Site (primary hosting).
- `node-server`: preserved Node Web Service fallback, initially at `918971f`.

Keep the existing Node service until static-site acceptance is complete. Point
its branch setting at `node-server`; keep `npm start` and `/healthz` there.
Render service types are separate: use a Static Site for `main` and a Web
Service for `node-server`. Changing a Git branch does not change service type.
The fallback is a snapshot, not an automatically synchronized mirror. Bring
future application fixes to both branches when both need to remain current.

## Create the Static Site

1. Render dashboard: **New > Static Site**, connect `andrawsMalallah/hyperion-fe`.
2. Use the settings below. Do not enter a start command or health-check path.

| Setting | Value |
| --- | --- |
| Branch | `main` |
| Root directory | blank (the repository root is already the frontend) |
| Build command | `npm ci --include=dev && npm run build` |
| Publish directory | `dist` |
| Auto-deploy | After CI Checks Pass |
| Environment variable | `SKIP_INSTALL_DEPS=true` (the build installs explicitly) |

`.node-version` selects Node 24. Remove any stale dashboard `NODE_VERSION`
override or select a supported Node 24 version. The committed production Vite
configuration supplies the API and public Sentry DSN; no backend secrets belong
in this service. Dashboard Vite overrides take precedence: check that any
`VITE_API_URL` override uses `https://hyperion-api-m4ze.onrender.com`.

3. Under **Redirects/Rewrites**, add:

| Source | Destination | Action |
| --- | --- | --- |
| `/*` | `/index.html` | Rewrite |

Existing files are served normally; this fallback lets Vue Router handle direct
links such as `/history`. Use Rewrite, not Redirect.

4. Under **Headers**, add these entries:

| Path | Name | Value |
| --- | --- | --- |
| `/*` | `X-Content-Type-Options` | `nosniff` |
| `/*` | `Referrer-Policy` | `strict-origin-when-cross-origin` |
| `/*` | `Cache-Control` | `no-cache` |
| `/*` | `Content-Security-Policy` | Copy the complete single line below |

```text
default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; font-src 'self'; connect-src 'self' https://hyperion-api-m4ze.onrender.com https://o4511743891275776.ingest.de.sentry.io; worker-src 'self'; manifest-src 'self'; object-src 'none'; base-uri 'self'; form-action 'self'; frame-ancestors 'none'
```

The conservative `no-cache` policy permits storage but requires revalidation;
it keeps HTML, service workers and unversioned files fresh. The PWA still uses
its own offline caches. Render serves this small app through its CDN.

The CSP must match `dist/.security-headers.json` from the production build,
including `frame-ancestors 'none'`. The JSON file is consumed by the optional
Node server; Render Static Sites do not automatically read it. The HTML meta
policy alone cannot enforce frame-ancestors. If API or Sentry origins change,
rebuild and update the dashboard header from that artifact.

## CI enforcement

The existing GitHub Actions workflow runs Node server HTTP tests and the
production build. Keep Playwright local-only. Select **After CI Checks Pass**
in Render's Auto-Deploy setting so later automatic deployments wait for CI.
The initial/manual deploy still needs its matching commit's CI checked.

To also block merges on GitHub: repository **Settings > Rules > Rulesets > New
branch ruleset**, target `main`, activate it, require a pull request and require
the existing **Build** status check (select the exact reported check). Until
these dashboard rules are enabled, merge protection is not enforced.

## Cutover and acceptance

1. Sync pending offline workouts on the old origin first. A new onrender.com
   origin does not inherit login, localStorage, offline outbox or installed PWA
   state. Keep the old site accessible until this is done.
2. Once the new URL is known, update the backend Render service's `FRONTEND_URL`
   to the final frontend origin, without a trailing slash. This controls CORS
   and reset/verification email links. Apply through the normal backend deploy
   process: cached configuration must be refreshed. Its existing entrypoint
   also runs migrations, so coordinate this with the normal production process.
   Do not change the local `.env` or production database manually.
3. Keep existing backend `APP_URL`, database, Brevo mail and Sentry settings.
4. On desktop and phone, test login; Home layout; opening and refreshing
   `/history` and an existing builder URL; password reset and email verification;
   and the installed PWA, including offline workout recovery. Inspect response
   headers and check for CSP/CORS errors in browser developer tools.
5. Keep the Node service as fallback until acceptance. With a custom domain,
   move it to the chosen service and follow Render's DNS/TLS instructions.
   When switching to a different origin in either direction, update backend
   `FRONTEND_URL` again and repeat login/email/PWA checks. The free backend can
   still cold-start even when the static frontend loads immediately.

## Local verification

Run `npm run test:server` and `npm run build`. Check that `dist/` contains no
`localhost:8000`, and compare the CSP above to `dist/.security-headers.json`.
Continue retaining tracked `dist/`; Render now builds from source on deployment.
The Node implementation stays available without deleting files or packages.

References: [Static Sites](https://render.com/docs/static-sites),
[rewrites](https://render.com/docs/redirects-rewrites),
[headers](https://render.com/docs/static-site-headers).
