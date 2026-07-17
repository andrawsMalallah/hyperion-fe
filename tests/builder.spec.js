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

// Two modals can hold the scroll lock at once: navigating away from a dirty
// program with the picker still open puts the unsaved-changes AppModal on top of
// it. The lock is a single class on <html>/<body>, so an uncounted
// add/remove lets the first modal to close unlock the page behind the one still
// open. useModalLock counts holders; this pins that.
test('the page stays scroll-locked when one of two stacked modals closes', async ({ page, request, authToken }) => {
  // Active, so Home's showcase offers the Edit shortcut this test navigates by.
  const program = (await api(request, authToken, 'POST', '/programs', {
    name: 'E2E Lock Program',
    is_active: true,
    days: [{ day_name: 'Legs', display_order: 1, exercises: [] }]
  })).data

  // Reach the builder THROUGH the SPA. Two page.goto()s would be two separate
  // documents, so going back would be a full page load that vue-router never
  // sees — and onBeforeRouteLeave (the whole point of this test) never fires.
  await page.goto('/')
  await page.getByRole('button', { name: 'Edit program' }).click()
  await page.waitForURL(`**/builder/${program.id}`)

  const picker = page.locator('.modal-overlay').filter({ has: page.locator('.modal-exercise-list') })
  const leaveModal = page.locator('.modal-overlay').filter({ hasText: 'Unsaved Changes' })

  // Dirty the program, so leaving triggers the unsaved-changes guard.
  await page.locator('button[title="Add Exercise"]').first().click()
  await expect(picker).toBeVisible()
  // `.selectable-item`, not `.exercise-item`: the loading skeletons reuse the
  // latter, and clicking one selects nothing.
  await picker.locator('.selectable-item').first().click()
  await picker.getByRole('button', { name: /Add Selected \(1\)/ }).click()
  await expect(picker).toBeHidden()

  // Re-open the picker and navigate away with it still up. The guard is async
  // (it holds the navigation open on a promise), so don't await the back.
  await page.locator('button[title="Add Exercise"]').first().click()
  await expect(picker).toBeVisible()
  page.goBack().catch(() => {})

  await expect(leaveModal).toBeVisible()
  await expect(picker).toBeVisible()

  // Stay: the AppModal closes, but the picker underneath is still open, so the
  // page behind must remain locked.
  await leaveModal.getByRole('button', { name: 'Stay' }).click()
  await expect(leaveModal).toBeHidden()
  await expect(picker).toBeVisible()

  await expect(page.locator('body')).toHaveClass(/modal-open/)
  await expect(page.locator('html')).toHaveClass(/modal-open/)

  // And the lock still lifts once the last holder closes.
  await page.keyboard.press('Escape')
  await expect(picker).toBeHidden()
  await expect(page.locator('body')).not.toHaveClass(/modal-open/)
})

// The picker is a hand-rolled overlay rather than an AppModal, so its keyboard
// behaviour comes from useFocusTrap and nothing else pins it.
test('the exercise picker traps focus and closes on Escape', async ({ page, request, authToken }) => {
  const program = (await api(request, authToken, 'POST', '/programs', {
    name: 'E2E Picker Program',
    days: [{ day_name: 'Legs', display_order: 1, exercises: [] }]
  })).data

  await page.goto(`/builder/${program.id}`)

  const trigger = page.locator('button[title="Add Exercise"]').first()
  await trigger.click()

  const picker = page.locator('.modal-overlay [role="dialog"]')
  await expect(picker).toBeVisible()
  await expect(picker).toHaveAttribute('aria-modal', 'true')

  // Focus must move INTO the dialog on open, not stay on the trigger behind it.
  await expect(picker.locator('.exercise-item').first()).toBeVisible()
  expect(await picker.evaluate(el => el.contains(document.activeElement))).toBe(true)

  // Shift+Tab off the top is the case that used to escape: focus starts on the
  // container, which is tabindex="-1" and so outside the tab cycle.
  await page.keyboard.press('Shift+Tab')
  expect(await picker.evaluate(el => el.contains(document.activeElement))).toBe(true)

  // Tabbing forward off the last control wraps back inside rather than leaving.
  await page.keyboard.press('Tab')
  expect(await picker.evaluate(el => el.contains(document.activeElement))).toBe(true)

  await page.keyboard.press('Escape')
  await expect(picker).toBeHidden()

  // Closing hands focus back to what opened it, not to <body>.
  await expect(trigger).toBeFocused()
})
