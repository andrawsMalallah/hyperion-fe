import { fileURLToPath } from 'node:url';
import { defineConfig, devices } from '@playwright/test';

// Neither binary is on PATH under Herd, and CI lays the backend out elsewhere.
const PHP = process.env.HYPERION_PHP || 'C:/Users/ndc/.config/herd/bin/php84/php.exe';
const BE = process.env.HYPERION_BE || fileURLToPath(new URL('../backend', import.meta.url));

// Dedicated ports, deliberately NOT the dev ones (8000 / 5173).
//
// The suite boots its own API + SPA and never reuses a running server. Reusing
// looks convenient and is a trap: a dev API on :8000 carries the real .env, so
// the suite would silently run against the live Brevo mailer (firing real emails
// at throwaway @example.test addresses) and the tight auth rate limit. Separate
// ports also mean a test run can't disturb, or be disturbed by, `npm run dev`.
//
// Must be "localhost", never "127.0.0.1": the browser treats them as different
// origins and CORS is pinned to exactly one (see FRONTEND_URL below).
const API_PORT = 8100;
const SPA_PORT = 5273;
const API_URL = `http://localhost:${API_PORT}`;
const SPA_URL = `http://localhost:${SPA_PORT}`;

export default defineConfig({
  testDir: './tests',
  // Each worker mints one account (tests/support/auth.js) and reuses it for every
  // test it runs — so an account is shared across spec files, not just within one.
  // Under `workers: 1` (CI) that means a single account for the whole project run.
  // Assertions must therefore scope to the data they created rather than counting
  // everything the account owns.
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: 'html',
  use: {
    baseURL: SPA_URL,
    trace: 'on-first-retry',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
    {
      name: 'mobile-chrome',
      use: { ...devices['Pixel 5'] },
    },
  ],
  webServer: [
    {
      // --no-reload is load-bearing, not a perf tweak: without it `artisan serve`
      // filters the child PHP process's environment down to a fixed whitelist
      // (ServeCommand::$passthroughVariables) and silently drops every override
      // below. It only disables restart-on-.env-change, which a test run doesn't
      // want anyway.
      command: `"${PHP}" artisan serve --host=127.0.0.1 --port=${API_PORT} --no-reload`,
      cwd: BE,
      url: `${API_URL}/up`,
      reuseExistingServer: false,
      env: {
        // Process-only overrides — .env is never touched. Laravel's dotenv is
        // immutable, so a real env var wins over the file.
        //
        // The local .env sends through the real Brevo HTTP API. Without this the
        // register + forgot-password specs fire genuine emails at throwaway
        // addresses, which bounce and cost sender reputation.
        MAIL_MAILER: 'log',
        // Every request in the run comes from one IP, so the 5/min/IP auth limit
        // would fail tests for reasons unrelated to the code under test.
        AUTH_RATE_LIMIT: '1000',
        // Same problem on the API limiter, which keys by user id: the whole run
        // shares ONE minted account, so all of it competes for a single 60/min
        // budget. Adding specs eventually trips it as a 429 that looks like a
        // flaky test (it surfaced as "POST /programs -> 429" in Session 28).
        API_RATE_LIMIT: '10000',
        // CORS is pinned to exactly this origin, and the SPA is on a test port.
        FRONTEND_URL: SPA_URL,
      },
    },
    {
      command: `npx vite --host localhost --port ${SPA_PORT} --strictPort`,
      url: SPA_URL,
      reuseExistingServer: false,
      // Vite picks up VITE_-prefixed process env vars and they beat
      // .env.development, which points at the dev API on :8000.
      env: { VITE_API_URL: API_URL },
    },
  ],
});
