import { test, expect, api, API, finishWorkout } from './support/auth.js'

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
  // Wait for the fetch to actually LAND; otherwise the store isn't loaded, its TTL
  // hasn't started, and the return trip after the workout would refetch — hiding a
  // broken prepend. The landed signal must be a *real* card or the empty-state, NOT
  // the loading skeleton: the skeleton (aria-hidden) also carries `.history-card`,
  // so keying on `.history-card` alone was racy — it caught a skeleton locally but,
  // on a fresh empty account (History runs first, no prior workouts), CI resolved
  // to the empty-state where no card exists and the assertion timed out.
  await expect(
    page.locator('.history-list:not([aria-hidden="true"]) .history-card, .empty-state').first()
  ).toBeVisible()
  // The day we're about to log must not already be on screen. toHaveCount(0)
  // tolerates an empty account (zero cards) instead of requiring one to exist,
  // and is a positive check that this exact session isn't present yet.
  await expect(page.locator('.history-card', { hasText: dayName })).toHaveCount(0)

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

/**
 * Guards a load-bearing product invariant (CLAUDE.md): deleting a program KEEPS
 * its workout logs. The days cascade away and workout_logs.program_day_id nulls
 * out (nullOnDelete), so the session survives as history with no day — History
 * renders it as "Unknown Day" / "Unknown Program". "Training history is the
 * product", so the program-delete path must never be the one thing that erases it.
 *
 * A page.goto() is correct here (unlike the prepend test above): we WANT a fresh
 * server fetch, to prove the surviving log is what the server returns.
 */
test('a workout survives its program being deleted and shows as Unknown Day', async ({ page, request, authToken }) => {
  // Distinctive reps: other specs log 10/12, so "x 23" scopes to this session's
  // set even though the account's History is shared across the whole run.
  const REPS = 23

  const exercise = (await api(request, authToken, 'GET', '/exercises?search=press')).data[0]

  const program = (await api(request, authToken, 'POST', '/programs', {
    name: `Deletable Program ${Date.now()}`,
    is_active: true,
    days: [{
      day_name: `Deletable ${Date.now()}`,
      display_order: 1,
      exercises: [{ exercise_id: exercise.id, target_sets: 1, rest_seconds: 60 }]
    }]
  })).data

  // Log a session against that day, then delete the program out from under it.
  await api(request, authToken, 'POST', '/workout-logs', {
    client_uuid: crypto.randomUUID(),
    program_day_id: program.days[0].id,
    date_timestamp: new Date().toISOString(),
    ended_at: new Date().toISOString(),
    sets: [{ exercise_id: exercise.id, weight: 60, reps: REPS, set_type: 'working', set_order: 0 }]
  })
  // DELETE returns 204 (no body), so bypass api()'s JSON parse and assert ok.
  const deleted = await request.fetch(`${API}/programs/${program.id}`, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${authToken}`, Accept: 'application/json' }
  })
  expect(deleted.ok(), `DELETE program -> ${deleted.status()}`).toBeTruthy()

  await page.goto('/history')

  // Newest-first, so this run's session is the first "x 23" card. It's still
  // there (survived the delete), now orphaned — Unknown Day / Unknown Program —
  // with its logged sets intact.
  const card = page.locator('.history-list:not([aria-hidden="true"]) .history-card', {
    hasText: `x ${REPS}`
  }).first()
  await expect(card).toContainText('Unknown Day')
  await expect(card).toContainText('Unknown Program')
})

/**
 * History filters (ROADMAP 1.12): a program dropdown + date-range presets.
 *
 * The worker's account is shared across specs, but a freshly created, uniquely
 * named program isolates this test's data perfectly: filtering to it can only
 * ever show the two sessions logged here, so count assertions are safe despite
 * the shared history. Covers BOTH filter axes in one flow — program, then a date
 * preset that must drop the deliberately-old session.
 */
test('History can be filtered by program and by date range', async ({ page, request, authToken }) => {
  // Distinctive reps: no other spec logs 91/92, so they identify these sessions.
  const RECENT_REPS = 91
  const OLD_REPS = 92
  const programName = `Filter Program ${Date.now()}`

  const exercise = (await api(request, authToken, 'GET', '/exercises?search=press')).data[0]

  const program = (await api(request, authToken, 'POST', '/programs', {
    name: programName,
    is_active: false,
    days: [{
      day_name: `Filter Day ${Date.now()}`,
      display_order: 1,
      exercises: [{ exercise_id: exercise.id, target_sets: 1, rest_seconds: 60 }]
    }]
  })).data
  const dayId = program.days[0].id

  // One recent session and one ~200 days old, both on this program.
  const logSession = (daysAgo, reps) => api(request, authToken, 'POST', '/workout-logs', {
    client_uuid: crypto.randomUUID(),
    program_day_id: dayId,
    date_timestamp: new Date(Date.now() - daysAgo * 86400000).toISOString(),
    ended_at: new Date(Date.now() - daysAgo * 86400000).toISOString(),
    sets: [{ exercise_id: exercise.id, weight: 60, reps, set_type: 'working', set_order: 0 }]
  })
  await logSession(1, RECENT_REPS)
  await logSession(200, OLD_REPS)

  await page.goto('/history')

  const realCards = page.locator('.history-list:not([aria-hidden="true"]) .history-card')

  // Filter to this program — the dropdown option exists once programs load.
  await expect(page.locator('.filter-select option', { hasText: programName })).toBeAttached()
  await page.selectOption('.filter-select', { label: programName })

  // Exactly this program's two sessions, nothing from the shared account.
  await expect(realCards).toHaveCount(2)
  await expect(realCards.filter({ hasText: `x ${RECENT_REPS}` })).toHaveCount(1)
  await expect(realCards.filter({ hasText: `x ${OLD_REPS}` })).toHaveCount(1)

  // Now the 90-day preset must drop the ~200-day-old session.
  await page.locator('.filter-segment-btn', { hasText: '90d' }).click()
  await expect(realCards).toHaveCount(1)
  await expect(realCards.filter({ hasText: `x ${RECENT_REPS}` })).toHaveCount(1)
  await expect(realCards.filter({ hasText: `x ${OLD_REPS}` })).toHaveCount(0)
})
