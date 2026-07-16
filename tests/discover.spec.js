// Discover + clone had no coverage. Clone deliberately refuses your own
// programs (it's public-programs-only), so this needs a genuine second account
// publishing a program — which is also the only spec that proves the app works
// across two users at all.
import { test, expect, api, mintUser } from './support/auth.js'

// Unique per run: the catalog is shared and search must find exactly this one.
const PROGRAM_NAME = `E2E Public Program ${Date.now()}`

test('a public program from another user can be found and cloned', async ({ page, request, authToken }) => {
  // A second account publishes a program.
  const author = mintUser()
  const catalog = (await api(request, author.token, 'GET', '/exercises?per_page=1')).data
  await api(request, author.token, 'POST', '/programs', {
    name: PROGRAM_NAME,
    is_public: true,
    days: [{
      day_name: 'Shared Day',
      display_order: 1,
      exercises: [{ exercise_id: catalog[0].id, target_sets: 3 }]
    }]
  })

  // The logged-in user finds it in Discover.
  await page.goto('/discover')
  await page.locator('.search-bar-input').fill(PROGRAM_NAME)

  const card = page.locator('.discover-Program-card').filter({ hasText: PROGRAM_NAME })
  await expect(card).toHaveCount(1)
  await expect(card).toContainText(`by ${author.user.name}`)

  // Open the detail modal and save it.
  await card.locator('.eye-btn').click()
  const modal = page.locator('[role="dialog"], .modal-content').first()
  await expect(modal).toBeVisible()
  await modal.locator('.save-icon-btn').click()

  // The clone is a real deep copy in the user's own account, not just a toast.
  await expect(page.locator('.toast')).toContainText(/Saved to your programs/i)

  const mine = (await api(request, authToken, 'GET', '/programs')).data
  const cloned = mine.find(p => p.name === PROGRAM_NAME)
  expect(cloned, 'the cloned program should be in my programs').toBeTruthy()
  expect(cloned.days[0].day_name).toBe('Shared Day')
  expect(cloned.days[0].exercises[0].name).toBe(catalog[0].name)
})
