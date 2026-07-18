// Body-weight tracking (ROADMAP 1.10) driven through the Progress page's Body
// Weight card: log an entry, see it list; add a second day so the trend chart
// draws; re-log a date to prove the server upsert (one row per day, not a
// duplicate); delete an entry.
//
// The account is shared across the whole worker run, but no other spec logs body
// weight, and every assertion is scoped to a row matching a fixed date this spec
// created — so it can't be fooled by another spec's data (see CLAUDE.md).
import { test, expect } from './support/auth.js'

// Fixed, far-past dates so they never collide with a "today" entry and the
// display labels are stable. before_or_equal:today is satisfied.
const DAY_ONE = '2019-05-01'
const DAY_TWO = '2019-05-02'
const DAY_ONE_LABEL = 'May 1, 2019'
const DAY_TWO_LABEL = 'May 2, 2019'

async function logWeight(card, weight, ymd) {
  await card.locator('#bw-weight').fill(weight)
  await card.locator('#bw-date').fill(ymd)
  await card.locator('.bw-submit').click()
}

test('log, update and delete body weight from the Progress page', async ({ page, authToken }) => {
  await page.goto('/progress')

  const card = page.locator('.bodyweight-card')
  await expect(card).toBeVisible()

  const rowOne = card.locator('.bw-list-row').filter({ hasText: DAY_ONE_LABEL })
  const rowTwo = card.locator('.bw-list-row').filter({ hasText: DAY_TWO_LABEL })

  // Log day one -> it appears in the list with its weight.
  await logWeight(card, '80', DAY_ONE)
  await expect(rowOne).toHaveCount(1)
  await expect(rowOne).toContainText('80kg')

  // A second day gives two points, so the trend chart draws instead of the
  // "log at least two days" empty state.
  await logWeight(card, '81.5', DAY_TWO)
  await expect(rowTwo).toHaveCount(1)
  await expect(card.locator('.chart-empty')).toHaveCount(0)
  const path = card.locator('svg path').first()
  await expect(path).toBeVisible()
  expect((await path.getAttribute('d')).length, 'weight trend path should have geometry').toBeGreaterThan(10)

  // Re-logging day one UPDATES it (server upserts on the date): still one row
  // for that day, now carrying the corrected weight.
  await logWeight(card, '79', DAY_ONE)
  await expect(rowOne).toHaveCount(1)
  await expect(rowOne).toContainText('79kg')

  // Delete day two -> its row disappears.
  await rowTwo.locator('.bw-delete').click()
  await expect(rowTwo).toHaveCount(0)
  // Day one is untouched by the delete.
  await expect(rowOne).toHaveCount(1)
})
