import { test, expect, api, finishWorkout } from './support/auth.js'

/**
 * Covers history.prependLog() — the reason it exists.
 *
 * The history store is stale-while-revalidate (60s TTL), so a user who opened
 * History earlier in the session and comes back after a workout gets the CACHED
 * list: History.vue's onMounted fetch returns early without a request. The only
 * thing that puts the just-finished session on screen is the prepend.
 *
 * Everything here must stay INSIDE the SPA. A page.goto() is a new document,
 * which wipes the (deliberately unpersisted) history store — isLoaded goes
 * false, the view fetches from the server, and the row appears whether or not
 * prepending works. That's exactly why the existing workout/offline specs, which
 * goto('/history'), pass with prependLog fully broken.
 */
test('a workout finished after History was opened appears without a refetch', async ({ page, request, authToken }) => {
  // Unique per run: the worker's account is shared across spec files, so the
  // day name is what identifies this spec's session rather than a row count.
  const dayName = `Prepend ${Date.now()}`

  const exercises = (await api(request, authToken, 'GET', '/exercises?search=press')).data.slice(0, 1)
  await api(request, authToken, 'POST', '/programs', {
    name: 'Prepend Program',
    is_active: true,
    days: [{
      day_name: dayName,
      display_order: 1,
      exercises: [{ exercise_id: exercises[0].id, target_sets: 1, rest_seconds: 60 }]
    }]
  })

  // Open History first — this is what loads the list and starts the TTL.
  await page.goto('/')
  await page.click('.nav-item[href="/history"]')
  await page.waitForURL('**/history')
  // Wait for the fetch to actually land; otherwise the store may not be loaded
  // yet and the later visit would refetch, hiding a broken prepend.
  await expect(page.locator('.history-card, .empty-state').first()).toBeVisible()
  await expect(page.locator('.history-card').first()).not.toContainText(dayName)

  // Run the workout, all in-SPA.
  await page.click('.nav-item[href="/"]')
  await page.waitForURL(/\/$/)
  await page.click('.showcase-start-btn')
  await page.waitForURL('**/workout/**')
  await page.getByLabel('Set 1 weight (kg)').fill('50')
  await page.getByLabel('Set 1 reps').fill('10')
  await page.locator('button[title="Save Set"]').first().click()
  await page.click('.rest-timer-overlay >> text=Skip')
  await finishWorkout(page)

  // Block the list refetch. If the cache is served (the case under test) no
  // request is made and this changes nothing. If the store ever went stale
  // instead, this turns a false green — the server supplying the row that the
  // prepend was supposed to — into a loud failure.
  await page.route('**/api/workout-logs?*', route => {
    if (route.request().method() === 'GET') return route.abort()
    return route.fallback()
  })

  await page.click('.nav-item[href="/history"]')
  await page.waitForURL('**/history')

  // Top of the list, from local state alone.
  await expect(page.locator('.history-card').first()).toContainText(dayName)
})
