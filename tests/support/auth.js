import { execFileSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { test as base, expect } from '@playwright/test'

// The suite's own API port (see playwright.config.js) — deliberately not the
// dev server's :8000, so a test run and `npm run dev` can't interfere.
export const API = 'http://localhost:8100/api'

// The Laravel binary and repo aren't on PATH (Herd), and CI lays the backend
// out differently — so both are overridable. Defaults match a local Herd setup.
const PHP = process.env.HYPERION_PHP || 'C:/Users/ndc/.config/herd/bin/php84/php.exe'
// fileURLToPath, not URL.pathname — the latter yields "/C:/..." on Windows.
const BE = process.env.HYPERION_BE || fileURLToPath(new URL('../../../backend', import.meta.url))

/**
 * Mint a verified account + token straight from the backend.
 *
 * Registering through the UI can't work any more: email verification is a hard
 * requirement (Session 18), so a new account lands on /verify-email and never
 * reaches the app. That's exactly what silently killed every spec in this repo
 * between S18 and S24 — the old fixture waited for '**\/' and timed out.
 *
 * Going through artisan also sidesteps the 5/min/IP auth throttle, which one
 * runner sharing an IP across two browser projects would otherwise trip.
 */
export function mintUser(options = {}) {
  const args = ['artisan', 'hyperion:e2e-user']
  if (options.admin) args.push('--admin')
  if (options.resetToken) args.push('--reset-token')

  const raw = execFileSync(PHP, args, { cwd: BE, encoding: 'utf8' })

  // artisan may print warnings ahead of our JSON; take the last non-empty line.
  const line = raw.trim().split(/\r?\n/).filter(Boolean).pop()

  try {
    return JSON.parse(line)
  } catch {
    throw new Error(`hyperion:e2e-user did not return JSON. Got:\n${raw}`)
  }
}

/** Put an account's session into localStorage before the app boots. */
export async function applySession(page, account) {
  await page.addInitScript(([token, user]) => {
    localStorage.setItem('auth_token', token)
    localStorage.setItem('user', user)
  }, [account.token, JSON.stringify(account.user)])
}

/** Authenticated API call, asserting success so setup failures surface loudly. */
export async function api(request, token, method, path, data) {
  const res = await request.fetch(API + path, {
    method,
    headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' },
    data
  })
  expect(res.ok(), `${method} ${path} -> ${res.status()}`).toBeTruthy()
  return res.json()
}

/**
 * Finish an active workout and land back on Home.
 *
 * Saving doesn't redirect — it opens a summary modal ("Workout Complete", or
 * "Saved Offline" when queued) whose confirm button navigates home.
 */
export async function finishWorkout(page) {
  await page.locator('.builder-save-btn').click()
  await page.getByRole('button', { name: 'Go Home' }).click()
  await page.waitForURL('**/')
}

// One account per worker, reused across that worker's tests. Minting is cheap,
// but a shared account keeps each spec's data visible to the next.
const session = {}

export const test = base.extend({
  authToken: async ({ page }, use) => {
    if (!session.account) session.account = mintUser()
    await applySession(page, session.account)
    await use(session.account.token)
  }
})

export { expect }
