// Requires the Laravel API on http://localhost:8000 with a seeded exercise
// catalog and a personal-access Passport client (playwright.config.js boots it).
import { test, expect, api, finishWorkout } from './support/auth.js'

test('log a prescribed workout end-to-end', async ({ page, request, authToken }) => {
  const token = authToken

  // Seed a program with a prescription through the API (setup only).
  const exercises = (await api(request, token, 'GET', '/exercises?search=press')).data.slice(0, 1)
  await api(request, token, 'POST', '/programs', {
    name: 'E2E Program',
    is_active: true,
    days: [{
      day_name: 'Push',
      display_order: 1,
      exercises: [{
        exercise_id: exercises[0].id,
        target_sets: 2,
        rep_range_min: 8,
        rep_range_max: 12,
        rest_seconds: 60
      }]
    }]
  })

  // Start the workout from Home.
  await page.goto('/')
  await page.click('.showcase-start-btn')
  await page.waitForURL('**/workout/**')

  // Prescription prefills two rows and shows the target.
  await expect(page.locator('.rx-target-hint')).toContainText('2×8-12')
  await expect(page.locator('.set-row')).toHaveCount(2)

  // Log a set; the rest timer starts with the prescribed 60s.
  await page.getByLabel('Set 1 weight (kg)').fill('60')
  await page.getByLabel('Set 1 reps').fill('10')
  await page.locator('button[title="Save Set"]').first().click()
  await expect(page.locator('.rest-timer-overlay')).toBeVisible()
  await expect(page.locator('.rest-time')).toHaveText(/^(1:00|0:5\d)$/)
  await page.click('.rest-timer-overlay >> text=Skip')

  // Second set, then save the workout.
  await page.getByLabel('Set 2 weight (kg)').fill('62.5')
  await page.getByLabel('Set 2 reps').fill('9')
  await page.locator('button[title="Save Set"]').first().click()
  await page.click('.rest-timer-overlay >> text=Skip')
  await finishWorkout(page)

  // The session shows up in History with both sets. Scoped to the newest card:
  // the worker's account is shared across spec files (see support/auth.js), so
  // an unscoped count picks up other specs' workouts too.
  await page.goto('/history')
  const latestSession = page.locator('.history-card').first()
  await expect(latestSession).toContainText('Push')
  await expect(latestSession.locator('.history-set-pill')).toHaveCount(2)
})

test('rest timer survives a page reload', async ({ page, request, authToken }) => {
  const token = authToken

  const exercises = (await api(request, token, 'GET', '/exercises?search=squat')).data.slice(0, 1)
  await api(request, token, 'POST', '/programs', {
    name: 'Timer Program',
    is_active: true,
    days: [{ day_name: 'Legs', display_order: 1, exercises: [{ exercise_id: exercises[0].id }] }]
  })

  await page.goto('/')
  await page.click('.showcase-start-btn')
  await page.waitForURL('**/workout/**')

  await page.click('button[title="Add Set"]')
  await page.getByLabel('Set 1 weight (kg)').fill('100')
  await page.getByLabel('Set 1 reps').fill('5')
  await page.locator('button[title="Save Set"]').first().click()
  await expect(page.locator('.rest-timer-overlay')).toBeVisible()

  await page.reload()

  // Wall-clock anchored: still counting after the reload, and the
  // completed set was restored from the persisted session.
  await expect(page.locator('.rest-timer-overlay')).toBeVisible()
  await expect(page.locator('.set-row.is-completed')).toHaveCount(1)
})

test('escape closes a dialog', async ({ page, authToken }) => {
  await page.goto('/create')
  await page.click('text=Custom Program')
  await expect(page.locator('[role="dialog"]')).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(page.locator('[role="dialog"]')).toHaveCount(0)
})
