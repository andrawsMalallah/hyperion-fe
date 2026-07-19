// Pending-action buttons show an animated "Saving" + cycling dots instead of a
// spinner (user's call, S38). Two things this pins, both of which fail silently:
//
//  1. The dots must ACCUMULATE . -> .. -> ... The obvious CSS (one keyframe,
//     staggered animation-delay) makes them SLIDE instead ('.', '..', ' ..')
//     because each dot's visible window moves with its delay rather than
//     nesting inside the previous one's. Caught by sampling opacity.
//  2. The button must NOT resize while the dots cycle. All three dots are
//     always present and only toggle opacity — animating the character count
//     would re-measure the button on every tick and make the row jump.
import { test, expect, api } from './support/auth.js'

test('the save button shows accumulating dots without resizing', async ({ page, request, authToken }) => {
  const exercises = (await api(request, authToken, 'GET', '/exercises?search=squat')).data.slice(0, 1)
  const program = await api(request, authToken, 'POST', '/programs', {
    name: 'Pending Label',
    is_active: true,
    days: [{ day_name: 'Day A', display_order: 1, exercises: [{ exercise_id: exercises[0].id }] }]
  })
  const id = (program.data ?? program).id

  await page.setViewportSize({ width: 412, height: 915 })
  await page.goto(`/builder/${id}`)
  await page.waitForSelector('.builder-save-btn')

  // Dirty the draft, then stall the save so the pending state stays on screen.
  await page.locator('.builder-visibility-btn').click()
  await page.waitForTimeout(200)
  await page.route('**/api/programs/**', async route => {
    await new Promise(resolve => setTimeout(resolve, 4000))
    await route.continue()
  })
  await page.locator('.builder-save-btn').click()

  const label = page.locator('.builder-save-btn .pending-label')
  await expect(label).toBeVisible()

  // No spinner anywhere — the whole point of the change.
  await expect(page.locator('.builder-save-btn .button-spinner')).toHaveCount(0)

  // Sample over ~2.5s — more than two full 1.2s cycles, so the reset is visible.
  const samples = await page.locator('.builder-save-btn').evaluate(async btn => {
    const dots = [...btn.querySelectorAll('.pending-dot')]
    const ordered = []
    const widths = []
    for (let i = 0; i < 25; i++) {
      const frame = dots.map(d => (getComputedStyle(d).opacity === '1' ? '.' : '_')).join('')
      if (ordered[ordered.length - 1] !== frame) ordered.push(frame)
      widths.push(+btn.getBoundingClientRect().width.toFixed(1))
      await new Promise(r => setTimeout(r, 100))
    }
    return { ordered, widths: [...new Set(widths)] }
  })

  // Only the three accumulating states may ever appear. A sliding animation
  // (one keyframe + staggered animation-delay) produces '_..' and fails here.
  for (const frame of samples.ordered) {
    expect(['.__', '.._', '...'], `unexpected dot frame "${frame}"`).toContain(frame)
  }

  // All three stages must be reached, in order, and then RESET.
  // ⚠️ Without the reset check a constant-on keyframe passes: the dots latch
  // on one by one and then stick at '...' forever, which still only ever
  // yields the three allowed frames. Verified — that variant passed until this
  // assertion was added.
  expect(samples.ordered.slice(0, 3), 'dots should accumulate in order').toEqual(['.__', '.._', '...'])
  expect(samples.ordered.length, 'dots should cycle back to one dot, not stick at "..."')
    .toBeGreaterThan(3)
  expect(samples.ordered[3], 'the cycle should restart at a single dot').toBe('.__')

  // The button width must never change while the dots cycle.
  expect(samples.widths.length, `button resized while animating: ${samples.widths}`).toBe(1)
})
