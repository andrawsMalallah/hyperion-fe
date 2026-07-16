// Every other spec seeds programs through the API, so ProgramBuilder's own UI —
// the thing users actually build programs with — was never driven end-to-end.
// This walks the real path: Create → name it → add a day → add an exercise →
// save, then proves the program is really on the server, not just on screen.
import { test, expect, api } from './support/auth.js'

const PROGRAM_NAME = 'E2E Built Program'
const DAY_NAME = 'E2E Push Day'

test('a program built in the UI saves and comes back from the server', async ({ page, request, authToken }) => {
  await page.goto('/create')

  // Custom Program opens a prompt for the name.
  await page.click('text=Custom Program')
  const dialog = page.locator('[role="dialog"]')
  await expect(dialog).toBeVisible()
  await dialog.locator('input[type="text"]').fill(PROGRAM_NAME)
  await dialog.getByRole('button', { name: 'Create' }).click()

  await page.waitForURL('**/builder/new')

  // A custom program starts with no days at all — one has to be added first.
  await expect(page.locator('.day-card')).toHaveCount(0)
  await page.locator('.builder-add-day-btn').click()
  const dayDialog = page.locator('[role="dialog"]')
  await dayDialog.locator('input[type="text"]').fill(DAY_NAME)
  await dayDialog.getByRole('button', { name: 'Add' }).click()
  await expect(page.locator('.day-card')).toHaveCount(1)

  // Add the first exercise from the catalog to the day.
  await page.locator('button[title="Add Exercise"]').first().click()
  const picker = page.locator('.modal-overlay')
  await expect(picker).toBeVisible()

  const firstExercise = picker.locator('.exercise-item').first()
  await expect(firstExercise).toBeVisible()
  const exerciseName = (await firstExercise.locator('.ex-name').textContent()).trim()
  await firstExercise.click()
  await picker.getByRole('button', { name: /Add Selected/ }).click()

  await expect(page.locator('.day-card')).toContainText(exerciseName)

  // Save, and wait for the button to settle into its saved state.
  await page.locator('.builder-save-btn').click()
  await expect(page.locator('.builder-save-btn')).toHaveText('Saved')

  // The real assertion: it persisted. A green button proves nothing on its own.
  const programs = (await api(request, authToken, 'GET', '/programs')).data
  const saved = programs.find(p => p.name === PROGRAM_NAME)
  expect(saved, `"${PROGRAM_NAME}" should exist on the server`).toBeTruthy()
  expect(saved.days[0].day_name).toBe(DAY_NAME)
  expect(saved.days[0].exercises[0].name).toBe(exerciseName)
})
