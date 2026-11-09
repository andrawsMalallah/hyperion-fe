import { test, expect, api } from './support/auth.js'

test('program titles wrap beside fixed header actions without widening the dashboard', async ({ page, request, authToken }) => {
  const catalog = (await api(request, authToken, 'GET', '/exercises?per_page=1')).data
  const days = [{ day_name: 'Training', display_order: 1, exercises: [{ exercise_id: catalog[0].id }] }]
  await api(request, authToken, 'POST', '/programs', { name: 'Saved layout control', days })

  // Include the reported name and an unbroken name: flex's automatic minimum
  // width must not turn either into a wider grid track on a narrow phone.
  for (const programName of ['Anterior/Posterior', 'AnteriorPosterior'.repeat(8)]) {
    await api(request, authToken, 'POST', '/programs', { name: programName, is_active: true, days })
    await page.goto('/')
    await expect(page.locator('.showcase-title')).toHaveText(programName)

    for (const width of [320, 357, 390, 439, 700, 1024]) {
      await page.setViewportSize({ width, height: 850 })
      const layout = await page.evaluate(() => {
        const card = document.querySelector('.active-Program-showcase')
        const title = card.querySelector('.showcase-title')
        const actions = card.querySelector('.showcase-header-actions')
        const cardBox = card.getBoundingClientRect()
        const titleBox = title.getBoundingClientRect()
        const actionsBox = actions.getBoundingClientRect()
        const cardStyle = getComputedStyle(card)
        return {
          viewport: innerWidth,
          documentWidth: document.documentElement.scrollWidth,
          gridRight: document.querySelector('.dashboard-grid').getBoundingClientRect().right,
          cardRight: cardBox.right,
          titleRight: titleBox.right,
          titleHeight: titleBox.height,
          actionsLeft: actionsBox.left,
          actionsRight: actionsBox.right,
          contentRight: cardBox.right - parseFloat(cardStyle.paddingRight) - parseFloat(cardStyle.borderRightWidth),
          buttons: [...actions.querySelectorAll('button')].map(button => {
            const box = button.getBoundingClientRect()
            return { top: box.top, width: box.width, height: box.height }
          }),
        }
      })

      expect(layout.documentWidth, `${programName} at ${width}px`).toBeLessThanOrEqual(layout.viewport)
      expect(layout.cardRight).toBeLessThanOrEqual(layout.gridRight + 1)
      expect(layout.titleRight).toBeLessThanOrEqual(layout.actionsLeft - 11)
      expect(Math.abs(layout.actionsRight - layout.contentRight)).toBeLessThan(1)
      expect(layout.buttons).toHaveLength(3)
      for (const button of layout.buttons) {
        expect(button.top).toBe(layout.buttons[0].top)
        expect(button.width).toBe(36)
        expect(button.height).toBe(36)
      }
      if (width <= 390) expect(layout.titleHeight).toBeGreaterThan(30)
    }
  }
})
