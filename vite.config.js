import { defineConfig, loadEnv } from 'vite'
import vue from '@vitejs/plugin-vue'
import { fileURLToPath, URL } from 'node:url'

/**
 * Assembles the Content-Security-Policy string for a production build.
 *
 * `connectOrigins` are the scheme+host values the app may send requests to —
 * the Hyperion API, plus Sentry's ingest host when error monitoring is enabled.
 * Anything not listed here is blocked by the browser.
 */
function buildContentSecurityPolicy(connectOrigins) {
  const directives = [
    // Everything defaults to same-origin; the directives below only loosen this
    // where the app genuinely needs it.
    "default-src 'self'",
    // The production build emits no inline scripts (Vite bundles to /assets/*.js),
    // so scripts need no 'unsafe-inline' / 'unsafe-eval' escape hatch.
    "script-src 'self'",
    // Vue renders `:style` bindings (progress bars, the hand-rolled SVG charts)
    // as inline style attributes, which CSP blocks unless 'unsafe-inline' is set.
    "style-src 'self' 'unsafe-inline'",
    // Inline SVG icons are embedded as data:image/svg+xml URIs.
    "img-src 'self' data:",
    "font-src 'self'",
    // The only permitted cross-origin fetch/XHR destinations.
    `connect-src 'self' ${connectOrigins.join(' ')}`,
    // The PWA service worker (public/sw.js) is served from our own origin.
    "worker-src 'self'",
    "manifest-src 'self'",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
  ]

  return directives.join('; ')
}

/**
 * Injects the CSP as a <meta http-equiv> into the built index.html.
 *
 * Build-only (`apply: 'build'`) on purpose: index.html is shared with the dev
 * server, where a production CSP would block both the local API origin and
 * Vite's HMR websocket. Real enforcement in production comes from the Render
 * static-site response headers — this meta tag is the in-code fallback, and it
 * cannot express frame-ancestors / nosniff / Referrer-Policy (headers only).
 */
function contentSecurityPolicyPlugin(connectOrigins) {
  return {
    name: 'hyperion-csp-meta',
    apply: 'build',
    transformIndexHtml(html) {
      return {
        html,
        tags: [
          {
            tag: 'meta',
            attrs: {
              'http-equiv': 'Content-Security-Policy',
              content: buildContentSecurityPolicy(connectOrigins),
            },
            injectTo: 'head-prepend',
          },
        ],
      }
    },
  }
}

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), 'VITE_')

  // The CSP's connect-src is derived from the same env vars the app itself uses
  // (VITE_API_URL in src/api.js, VITE_SENTRY_DSN in src/sentry.js), so the
  // allowed origins can never drift from the ones actually called.
  if (!env.VITE_API_URL) {
    throw new Error('VITE_API_URL is not set — it is required to build the Content-Security-Policy.')
  }
  const connectOrigins = [new URL(env.VITE_API_URL).origin]

  // Sentry posts events to its ingest host; without it in connect-src the CSP
  // would block every report and error monitoring would silently do nothing.
  if (env.VITE_SENTRY_DSN) {
    connectOrigins.push(new URL(env.VITE_SENTRY_DSN).origin)
  }

  return {
    plugins: [vue(), contentSecurityPolicyPlugin(connectOrigins)],
    resolve: {
      alias: {
        '@': fileURLToPath(new URL('./src', import.meta.url))
      }
    }
  }
})
