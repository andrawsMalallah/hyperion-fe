// The in-button loading spinner must stay CIRCULAR at phone widths.
//
// `.button-spinner` is 14x14, but every button that hosts one is a flex
// container — so the spinner is a flex item and shrinks by default when the
// button is tight on width. Only the width collapses (height is fixed), and
// border-radius: 50% turns the resulting non-square box into a thin spinning
// ellipse. Reported from a real Galaxy S20 Ultra.
//
// ⚠️ 412px is the worst case ON PURPOSE, and the reason is counter-intuitive:
// it sits just ABOVE the `max-width: 400px` breakpoint, so the button keeps its
// wider 18px padding and leaves LESS room inside than a narrower phone does.
// Testing only at 360px would miss this.
import { test, expect, api } from './support/auth.js'

test('the in-button save spinner stays circular at phone widths', async ({ page, request, authToken }) => {
  const exercises = (await api(request, authToken, 'GET', '/exercises?search=squat')).data.slice(0, 1)
  const program = await api(request, authToken, 'POST', '/programs', {
    name: 'Spinner Geometry',
    is_active: true,
    days: [{ day_name: 'Day A', display_order: 1, exercises: [{ exercise_id: exercises[0].id }] }]
  })
  const id = (program.data ?? program).id

  for (const width of [360, 412]) {
    await page.setViewportSize({ width, height: 915 })
    await page.goto(`/builder/${id}`)
    await page.waitForSelector('.builder-save-btn')

    // Dirty the draft so Save enables, then stall the request so the saving
    // state stays on screen long enough to measure.
    await page.locator('.builder-visibility-btn').click()
    await page.waitForTimeout(200)
    await page.route('**/api/programs/**', async route => {
      await new Promise(resolve => setTimeout(resolve, 3500))
      await route.continue()
    })
    await page.locator('.builder-save-btn').click()

    const spinner = page.locator('.builder-save-btn .button-spinner')
    await expect(spinner).toBeVisible()

    const box = await spinner.evaluate(el => {
      const r = el.getBoundingClientRect()
      return { w: +r.width.toFixed(1), h: +r.height.toFixed(1) }
    })

    expect(Math.abs(box.w - box.h), `spinner must be square at ${width}px, got ${box.w}x${box.h}`).toBeLessThan(0.5)
    expect(box.w, `spinner must not collapse at ${width}px`).toBeGreaterThan(13)

    await page.unroute('**/api/programs/**')
    await page.waitForTimeout(200)
  }
})
