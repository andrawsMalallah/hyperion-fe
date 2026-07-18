// The admin exercise-approval dashboard (Session 21) — an entire privileged
// surface that had no E2E coverage. These drive the real approve/reject actions
// in a browser; AdminExerciseController tests cover the server side.
//
// Accounts are minted per test (not via the shared `authToken` fixture) because
// this flow needs an admin AND a separate contributor whose pending exercise the
// admin acts on. Every assertion scopes to a uniquely named exercise, since the
// admin tables list the whole catalog shared across the run.
import { test, expect, api, mintUser, applySession } from './support/auth.js'

// A pending contribution, created straight through the API by a throwaway
// contributor. Returns its unique name so assertions can scope to it.
async function seedPendingExercise(request) {
  const contributor = mintUser()
  const name = `E2E Pending ${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
  await api(request, contributor.token, 'POST', '/exercises', {
    name,
    target_muscle_group: 'Chest',
    mechanics_type: 'Isolation',
    measurement_type: 'weighted'
  })
  return name
}

test('an admin approves a pending contribution and it leaves the queue', async ({ page, request }) => {
  const name = await seedPendingExercise(request)

  await applySession(page, mintUser({ admin: true }))
  await page.goto('/admin')

  // The "Pending requests" queue is the first admin-section.
  const queue = page.locator('.admin-section').first()
  const row = queue.locator('tr', { hasText: name })
  await expect(row).toHaveCount(1)

  await row.getByRole('button', { name: 'Approve' }).click()

  // Approve refetches both lists (admin store refresh), so the row leaves the queue.
  await expect(queue.locator('tr', { hasText: name })).toHaveCount(0)
})

test('an admin rejects a pending contribution and the reason is recorded', async ({ page, request }) => {
  const name = await seedPendingExercise(request)

  await applySession(page, mintUser({ admin: true }))
  await page.goto('/admin')

  const queue = page.locator('.admin-section').first()
  const row = queue.locator('tr', { hasText: name })
  await expect(row).toHaveCount(1)

  // Reject opens a modal for an optional reason.
  await row.getByRole('button', { name: 'Reject' }).click()
  await page.getByLabel('Reason (optional)').fill('Duplicate of an existing exercise')
  await page.getByRole('button', { name: 'Reject Exercise' }).click()

  await expect(queue.locator('tr', { hasText: name })).toHaveCount(0)

  // The exercise still exists — now Rejected, with its reason, in All exercises.
  const all = page.locator('.admin-section').nth(1)
  await all.getByLabel('Status').selectOption('rejected')
  await all.getByLabel('Search name').fill(name)

  const rejectedRow = all.locator('tr', { hasText: name })
  await expect(rejectedRow).toContainText('Rejected')
  await expect(rejectedRow).toContainText('Duplicate of an existing exercise')
})

test('a non-admin is bounced from the admin dashboard', async ({ page }) => {
  await applySession(page, mintUser()) // a normal, non-admin account
  await page.goto('/admin')

  // The router guard redirects requiresAdmin && !isAdmin to Home (the backend's
  // EnsureAdmin is the real boundary; this just avoids a dead screen).
  await expect(page).toHaveURL(/\/$/)
  await expect(page.locator('.admin-page')).toHaveCount(0)
})
