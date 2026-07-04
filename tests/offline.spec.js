import { test, expect } from '@playwright/test'

// Drives the offline-sync path: finish a workout with the network down, prove
// it's queued locally (not lost), then reconnect and prove it uploads. Needs
// the local API on :8000 with a seeded catalog (see the throwaway harness).
const API = 'http://localhost:8000/api'

async function register(page) {
  const email = `offline-${Date.now()}-${Math.random().toString(36).slice(2, 6)}@example.com`
  await page.goto('/register')
  await page.fill('#name', 'Offline User')
  await page.fill('#email', email)
  await page.fill('#password', 'offline-pass-123')
  await page.fill('#password_confirmation', 'offline-pass-123')
  await page.click('button[type=submit]')
  await page.waitForURL('**/')
  return page.evaluate(() => localStorage.getItem('auth_token'))
}

async function api(request, token, method, path, data) {
  const res = await request.fetch(API + path, {
    method,
    headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' },
    data
  })
  expect(res.ok(), `${method} ${path} -> ${res.status()}`).toBeTruthy()
  return res.json()
}

test('a workout finished offline queues locally and syncs on reconnect', async ({ page, context, request }) => {
  test.setTimeout(60000)
  const token = await register(page)

  const exercises = (await api(request, token, 'GET', '/exercises?search=press')).data.slice(0, 1)
  await api(request, token, 'POST', '/programs', {
    name: 'Offline Program',
    is_active: true,
    days: [{
      day_name: 'Push',
      display_order: 1,
      exercises: [{ exercise_id: exercises[0].id, target_sets: 1 }]
    }]
  })

  await page.goto('/')
  await page.click('.showcase-start-btn')
  await page.waitForURL('**/workout/**')

  await page.getByLabel('Set 1 weight (kg)').fill('60')
  await page.getByLabel('Set 1 reps').fill('10')
  await page.locator('button[title="Save Set"]').first().click()
  const skip = page.locator('.rest-timer-overlay >> text=Skip')
  if (await skip.isVisible().catch(() => false)) await skip.click()

  // Pull the plug, then finish the workout.
  await context.setOffline(true)
  await page.click('text=Save Workout')

  // Local-first: back to Home, nothing lost, a pending-sync banner appears.
  await page.waitForURL('**/')
  await expect(page.locator('.sync-banner')).toBeVisible()
  await expect(page.locator('.sync-banner')).toContainText('1 workout')

  // Reconnect. A real browser fires an 'online' event on reconnect, which our
  // listener uses to auto-drain the outbox; Playwright's setOffline doesn't
  // dispatch it, so raise it ourselves to exercise that path.
  await context.setOffline(false)
  await page.evaluate(() => window.dispatchEvent(new Event('online')))

  // The outbox drains on its own and the banner clears.
  await expect(page.locator('.sync-banner')).toHaveCount(0, { timeout: 15000 })

  // Now it's on the server and in History.
  await page.goto('/history')
  await expect(page.locator('.history-card').first()).toContainText('Push')
  await expect(page.locator('.history-set-pill')).toHaveCount(1)
})
