// Drives the offline-sync path: finish a workout with the network down, prove
// it's queued locally (not lost), then reconnect and prove it uploads. Needs
// the local API on :8000 with a seeded catalog (playwright.config.js boots it).
import { test, expect, api, finishWorkout } from './support/auth.js'

test('a workout finished offline queues locally and syncs on reconnect', async ({ page, context, request, authToken }) => {
  test.setTimeout(60000)
  const token = authToken

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
  await finishWorkout(page)

  // Local-first: back to Home, nothing lost, a pending-sync banner appears.
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
  // Scoped to the newest card: the worker's account is shared across spec files
  // (see support/auth.js), so an unscoped count picks up other specs' workouts.
  // This counted globally until history.spec.js started logging a session ahead
  // of it — it had only ever passed by being the first spec to log a workout.
  await page.goto('/history')
  const syncedSession = page.locator('.history-card').first()
  await expect(syncedSession).toContainText('Push')
  await expect(syncedSession.locator('.history-set-pill')).toHaveCount(1)
})
