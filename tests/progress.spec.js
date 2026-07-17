// Progress was undriven end-to-end: 6.2 left it open, and nothing checked that
// a logged workout actually reaches the charts. The page is fed entirely by the
// server-side /progress/stats aggregate (+ the lazy per-exercise e1rm route), so
// this covers the whole path: log sets in the browser -> aggregate -> SVG.
import { test, expect, api, finishWorkout } from './support/auth.js'

// Two sessions of one exercise, because the trend chart needs at least two
// points ("Need at least two sessions of this exercise to draw a trend").
async function logSession(page, weight, reps) {
  await page.goto('/')
  await page.click('.showcase-start-btn')
  await page.waitForURL('**/workout/**')
  await page.getByLabel('Set 1 weight (kg)').fill(String(weight))
  await page.getByLabel('Set 1 reps').fill(String(reps))
  await page.locator('button[title="Save Set"]').first().click()
  await page.click('.rest-timer-overlay >> text=Skip')
  await finishWorkout(page)
}

test('a logged workout reaches the Progress charts', async ({ page, request, authToken }) => {
  const catalog = (await api(request, authToken, 'GET', '/exercises?search=press')).data.slice(0, 1)
  await api(request, authToken, 'POST', '/programs', {
    name: 'Progress Spec Program',
    is_active: true,
    days: [{
      day_name: 'Push',
      display_order: 1,
      exercises: [{ exercise_id: catalog[0].id, target_sets: 1, rest_seconds: 60 }]
    }]
  })

  await logSession(page, 60, 10)
  await logSession(page, 70, 10)

  await page.goto('/progress')

  // Tiles come from the same aggregate as the charts.
  const tiles = page.locator('.stat-tile')
  await expect(tiles.first()).toContainText('Sessions this week')
  await expect(tiles.first().locator('.tile-value')).not.toHaveText('0')

  // The exercise we just logged is selectable, and its trend renders as a real
  // SVG path — not the "need two sessions" empty state.
  await expect(page.locator('#exercise-select')).toContainText(catalog[0].name)
  const trendCard = page.locator('.chart-card').filter({ hasText: 'Estimated 1RM' })
  await expect(trendCard.locator('.chart-empty')).toHaveCount(0)
  const path = trendCard.locator('svg path').first()
  await expect(path).toBeVisible()
  expect((await path.getAttribute('d')).length, 'trend path should have geometry').toBeGreaterThan(10)

  // Weekly volume drew at least one bar.
  const volumeCard = page.locator('.chart-card').filter({ hasText: 'Weekly volume' })
  await expect(volumeCard.locator('.chart-empty')).toHaveCount(0)
  await expect(volumeCard.locator('svg path').first()).toBeVisible()

  // The heavier second session is the top set, so the table reflects the newest
  // session first.
  const topSets = page.locator('.chart-card').filter({ hasText: 'Recent Top Sets' })
  await expect(topSets.locator('tbody tr').first()).toContainText('70')
})
