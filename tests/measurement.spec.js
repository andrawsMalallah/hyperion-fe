// ROADMAP 1.9 — bodyweight and timed exercises.
//
// The rule this guards: which inputs a set row shows, and what gets logged,
// follow the EXERCISE's measurement_type. A plank takes a duration and no reps;
// a pull-up takes reps with optional added weight. ExerciseMeasurementTest
// covers the server side — this is the only check that the browser sends the
// right shape and renders it back.
import { test, expect, api, finishWorkout } from './support/auth.js'

const PLANK_SECONDS = '90'
const PULLUP_REPS = '12'

// Resolve by name: the seeded catalog is what carries the types, and ids differ
// between environments.
async function findExercise(request, token, name) {
  const results = (await api(request, token, 'GET', `/exercises?search=${encodeURIComponent(name)}`)).data
  const match = results.find(e => e.name === name)
  expect(match, `seeded exercise "${name}"`).toBeTruthy()
  return match
}

async function seedProgram(request, token) {
  const plank = await findExercise(request, token, 'Plank')
  const pullUp = await findExercise(request, token, 'Pull-Up')

  // The types must reach the client, or every assertion below passes for the
  // wrong reason (a weighted-looking row that happens to accept numbers).
  expect(plank.measurement_type).toBe('timed')
  expect(pullUp.measurement_type).toBe('bodyweight')

  await api(request, token, 'POST', '/programs', {
    name: 'Measurement Program',
    is_active: true,
    days: [{
      day_name: 'Core & Back',
      display_order: 1,
      exercises: [
        { exercise_id: plank.id, target_sets: 1, rest_seconds: 30 },
        { exercise_id: pullUp.id, target_sets: 1, rest_seconds: 30 }
      ]
    }]
  })

  return { plank, pullUp }
}

test('a timed exercise logs a hold and a bodyweight one logs reps', async ({ page, request, authToken }) => {
  await seedProgram(request, authToken)

  await page.goto('/')
  await page.click('.showcase-start-btn')
  await page.waitForURL('**/workout/**')

  const cards = page.locator('.exercise-card')
  await expect(cards).toHaveCount(2)

  const plankCard = cards.nth(0)
  const pullUpCard = cards.nth(1)

  // The timed card offers a duration and NOTHING else — no weight, no reps.
  // Asserting the absence is the point: a weight box here would mean the row
  // fell back to the weighted layout.
  await expect(plankCard.getByLabel('Set 1 duration in seconds')).toBeVisible()
  await expect(plankCard.getByLabel(/Set 1 weight/)).toHaveCount(0)
  await expect(plankCard.getByLabel('Set 1 reps')).toHaveCount(0)

  // The bodyweight card keeps reps, and its weight box is optional ADDED load.
  await expect(pullUpCard.getByLabel('Set 1 reps')).toBeVisible()
  await expect(pullUpCard.getByLabel(/Set 1 added weight/)).toBeVisible()

  // Log the hold.
  await plankCard.getByLabel('Set 1 duration in seconds').fill(PLANK_SECONDS)
  await plankCard.locator('button[title="Save Set"]').first().click()
  await expect(plankCard.locator('.set-row.is-completed')).toHaveCount(1)

  // Log the pull-up with the weight box left empty — "no added weight" must be
  // accepted, not treated as a missing required field.
  await pullUpCard.getByLabel('Set 1 reps').fill(PULLUP_REPS)
  await pullUpCard.locator('button[title="Save Set"]').first().click()
  await expect(pullUpCard.locator('.set-row.is-completed')).toHaveCount(1)

  await finishWorkout(page)

  // History renders each set in its own terms. Scope to the newest card: the
  // suite shares one account across spec files, so a global count picks up
  // other specs' sessions. The skeleton also carries `.history-card`, hence the
  // aria-hidden exclusion.
  await page.goto('/history')
  const newest = page.locator('.history-list:not([aria-hidden="true"]) .history-card').first()
  await expect(newest).toContainText('Core & Back')

  const pills = newest.locator('.history-set-pill')
  // 1:30 for the hold — not "90", and not a weight × reps pair.
  await expect(pills.filter({ hasText: '1:30' })).toHaveCount(1)
  // An unloaded bodyweight set shows bare reps, never "0kg x 12".
  await expect(pills.filter({ hasText: PULLUP_REPS })).toHaveCount(1)
  await expect(newest).not.toContainText('0kg')
})
