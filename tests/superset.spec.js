// The Session 24 rest rule: a superset rests ONCE, after its last exercise,
// using THAT exercise's rest_seconds. There is no group-level rest column — the
// other members' rest_seconds simply never fire. This spec is the only thing
// checking that in a real browser (ExerciseGroupingTest covers the server side).
import { test, expect, api } from './support/auth.js'

// Deliberately different rests: if the rule ever regresses to "rest after every
// exercise", the first exercise would fire 180s and this spec fails loudly.
const FIRST_REST = 180
const LAST_REST = 60

async function seedSupersetProgram(request, token) {
  const catalog = (await api(request, token, 'GET', '/exercises?per_page=2')).data
  expect(catalog.length, 'seeded exercise catalog').toBeGreaterThanOrEqual(2)

  await api(request, token, 'POST', '/programs', {
    name: 'Superset Program',
    is_active: true,
    days: [{
      day_name: 'Pull',
      display_order: 1,
      exercises: [
        {
          exercise_id: catalog[0].id,
          target_sets: 1,
          rest_seconds: FIRST_REST,
          group_type: 'superset',
          group_key: 1
        },
        {
          exercise_id: catalog[1].id,
          target_sets: 1,
          rest_seconds: LAST_REST,
          group_type: 'superset',
          group_key: 1
        }
      ]
    }]
  })

  return catalog
}

async function logFirstSet(card, weight, reps) {
  await card.getByLabel(/^Set 1 weight/).fill(weight)
  await card.getByLabel('Set 1 reps').fill(reps)
  await card.locator('button[title="Save Set"]').first().click()
}

test('a superset rests only after its last exercise, with that exercise\'s rest', async ({ page, request, authToken }) => {
  await seedSupersetProgram(request, authToken)

  await page.goto('/')
  await page.click('.showcase-start-btn')
  await page.waitForURL('**/workout/**')

  // The group is announced above its first member.
  await expect(page.locator('.group-header-label')).toHaveText(/Superset/i)

  const cards = page.locator('.exercise-card')
  await expect(cards).toHaveCount(2)

  // First member: the set logs, but no rest fires — you go straight into A2.
  await logFirstSet(cards.nth(0), '40', '10')
  await expect(cards.nth(0).locator('.set-row.is-completed')).toHaveCount(1)
  await expect(page.locator('.rest-timer-overlay')).toHaveCount(0)

  // Last member: now the group rests — and with 60s (its own), not the 180s
  // prescribed on the first exercise.
  await logFirstSet(cards.nth(1), '30', '12')
  await expect(page.locator('.rest-timer-overlay')).toBeVisible()
  await expect(page.locator('.rest-time')).toHaveText(/^(1:00|0:5\d)$/)
})
