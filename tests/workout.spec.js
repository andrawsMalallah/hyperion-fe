import { test, expect } from '@playwright/test';

test('workout split builder and execution flow', async ({ page }) => {
  // 1. Navigate to Home
  await page.goto('/');
  await expect(page).toHaveTitle(/workout-tracker/i);
  await expect(page.locator('h1')).toHaveText('Home');

  // If there are no saved splits, create one from PPL template
  const emptyState = page.locator('.empty-state');
  if (await emptyState.isVisible() && await emptyState.locator('text=Create New Split').isVisible()) {
    await emptyState.locator('text=Create New Split').click();
    await page.waitForURL('**/create');
    await page.click('text=Push / Pull / Legs');
    await page.waitForURL('**/builder');
    // Save Split in builder
    await page.click('button:has-text("Save Changes")');
    await page.waitForURL('**/');
  }

  // Ensure active split card exists
  const activeSplitCard = page.locator('.split-card.is-active').first();
  await expect(activeSplitCard).toBeVisible();

  // 2. Navigate to Builder by clicking Edit
  await activeSplitCard.locator('button:has-text("Edit")').click();
  await expect(page.locator('h1')).toHaveText('Push / Pull / Legs');

  // Find the 'Legs' day card and click its "+" button to add an exercise
  const legsCard = page.locator('.day-card').filter({ hasText: 'Legs' });
  await legsCard.locator('button[title="Add Exercise"]').click();

  // Search for an exercise in the modal
  await page.fill('.modal-content .search-input', 'Squat');
  
  const squatItem = page.locator('.modal-exercise-list .selectable-item').filter({ hasText: 'Barbell Squat' }).first();
  await expect(squatItem).toBeVisible();
  await squatItem.click();

  // Click Add Selected button in modal
  await page.click('button:has-text("Add Selected")');

  // Verify it was added to the 'Legs' day
  await expect(legsCard.locator('.exercise-item').filter({ hasText: 'Barbell Squat' })).toBeVisible();

  // Click Save Changes to persist split builder changes
  await page.click('button:has-text("Save Changes")');
  await page.waitForURL('**/');

  // 3. Go back to Home and Start Workout for Legs
  // Since the active split is expanded by default, we wait a moment for the transition to finish if any,
  // and click Start button directly.
  await page.waitForTimeout(500);
  
  const legsRow = page.locator('.day-row').filter({ hasText: 'Legs' });
  await legsRow.locator('button:has-text("Start")').click();

  // Verify Active Workout view
  await expect(page.locator('h1')).toContainText('Legs Workout');
  await expect(page.locator('.exercise-card')).toContainText('Barbell Squat');

  // 4. Enter test set data and finish workout
  // Click Add Set
  await page.click('.add-set-btn');

  const setRow = page.locator('.set-row').first();
  await setRow.locator('input[type="number"]').first().fill('100'); // Weight
  await setRow.locator('input[type="number"]').nth(1).fill('10');   // Reps
  
  // Click Save Set
  await setRow.locator('.save-set-btn').click();

  // Verify rest timer appears
  await expect(page.locator('.rest-timer-overlay')).toBeVisible();

  // Skip the timer
  await page.click('.rest-timer-overlay button:has-text("Skip")');

  // Save Workout
  await page.click('button:has-text("Save Workout")');

  // Verify redirected back to Home
  await expect(page.locator('h1')).toHaveText('Home');
});
