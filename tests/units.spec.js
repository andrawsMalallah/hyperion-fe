// ROADMAP 3.7 — the unit-switch-mid-workout bug turned out to be UNREACHABLE,
// and these specs pin the reason.
//
// The claim was: type "100" meaning lbs, switch the unit to kg, save → logged
// as 100kg. Typed values do live in the session buffer as bare strings with the
// unit only applied at save time (toKg(s.weight, workoutStore.weightUnit) in
// saveSet), so the arithmetic half is real. What makes it unreachable is that
// the weight unit can ONLY be changed in Settings, and every route from an
// active workout to Settings destroys the typed value first:
//
//   - a full page load discards it (activeWorkoutSession is not in persist.pick)
//   - in-SPA navigation is stopped by onBeforeRouteLeave's "Unsaved Workout"
//     modal, and confirming discards the session
//
// Those guards exist to protect the session, not to prevent this — so they
// could be relaxed by someone who doesn't know they're load-bearing here.
// That's what these two tests are for. If either goes red, re-read 3.7: the
// bug becomes reachable again.
import { test, expect, api } from './support/auth.js'

/** Start a workout on a throwaway single-exercise program. */
async function startWorkout(page, request, token, name) {
  const exercises = (await api(request, token, 'GET', '/exercises?search=squat')).data.slice(0, 1)
  await api(request, token, 'POST', '/programs', {
    name,
    is_active: true,
    days: [{ day_name: name, display_order: 1, exercises: [{ exercise_id: exercises[0].id }] }]
  })

  await page.goto('/')
  await page.click('.showcase-start-btn')
  await page.waitForURL('**/workout/**')
  await page.click('button[title="Add Set"]')
}

test('leaving an active workout with typed sets is blocked by a confirmation', async ({ page, request, authToken }) => {
  await startWorkout(page, request, authToken, 'Guard Program')

  await page.getByLabel('Set 1 weight (kg)').fill('100')
  await page.getByLabel('Set 1 reps').fill('5')

  // Settings is a dropdown <button> (router.push), so this is in-SPA navigation
  // — the only kind that keeps the component mounted, and therefore the only
  // kind that could carry a typed value across a unit change.
  await page.click('.user-menu-trigger')
  await page.click('.dropdown-item:has-text("Settings")')

  // The guard stops it. Without this modal the typed "100" would reach Settings
  // still mounted and still holding a unit-less string.
  const leaveModal = page.locator('[role="dialog"]:has-text("Unsaved Workout")')
  await expect(leaveModal).toBeVisible()

  // Staying keeps both the route and the typed value intact.
  await leaveModal.getByRole('button', { name: 'Stay' }).click()
  await expect(page).toHaveURL(/\/workout\//)
  await expect(page.getByLabel('Set 1 weight (kg)')).toHaveValue('100')
})

test('a typed but unsaved set does not survive a page reload', async ({ page, request, authToken }) => {
  await startWorkout(page, request, authToken, 'Reload Program')

  await page.getByLabel('Set 1 weight (kg)').fill('100')
  await page.getByLabel('Set 1 reps').fill('5')

  // A full document load rebuilds the session from persisted state, which holds
  // only SAVED sets (canonical kg, converted for display on mount). The typed
  // row is dropped rather than carried across as a unit-less number.
  await page.reload()

  const weightInput = page.getByLabel('Set 1 weight (kg)')
  if (await weightInput.count()) {
    await expect(weightInput).toHaveValue('')
  }
  await expect(page.locator('.set-row.is-completed')).toHaveCount(0)
})
