// The auth flows had no E2E coverage at all — which is precisely why the S18
// verification change silently broke every other spec in this repo for six
// sessions. The register test below is the one that would have caught it.
//
// These specs drive the auth endpoints, which are rate-limited per IP. The whole
// run comes from one IP, so the suite raises AUTH_RATE_LIMIT on the API it boots
// (see playwright.config.js) — the app's default stays 5/min.
import { test, expect, mintUser } from './support/auth.js'

// Must satisfy the app's password policy: min 8, mixed case, number, symbol.
const NEW_PASSWORD = 'E2e-Changed-456!'
const REGISTER_PASSWORD = 'E2e-Register-123!'

test('an existing user can log in', async ({ page }) => {
  const account = mintUser()

  await page.goto('/login')
  await page.fill('#email', account.email)
  await page.fill('#password', account.password)
  await page.click('button[type=submit]')

  await page.waitForURL('**/')
  await expect(page.getByText('Hello,')).toBeVisible()
})

test('registering lands on the verification screen, not the app', async ({ page }) => {
  // Email verification is a hard requirement (S18): a new account must NOT reach
  // the app until it verifies. The old fixture assumed the opposite and hung.
  const email = `e2e-register-${Date.now()}@example.test`

  await page.goto('/register')
  await page.fill('#name', 'E2E Register')
  await page.fill('#email', email)
  await page.fill('#password', REGISTER_PASSWORD)
  await page.fill('#password_confirmation', REGISTER_PASSWORD)
  await page.click('button[type=submit]')

  await page.waitForURL('**/verify-email')
  await expect(page.getByRole('heading', { name: 'Verify your email' })).toBeVisible()
})

test('forgot password accepts an email address', async ({ page }) => {
  const account = mintUser()

  await page.goto('/forgot-password')
  await page.fill('#email', account.email)
  await page.click('button[type=submit]')

  // Deliberately enumeration-safe: the same confirmation regardless of whether
  // the address exists, so this asserts the message, not a per-account outcome.
  await expect(page.locator('.toast')).toContainText(/reset link/i)
})

test('a reset token sets a new password that can log in', async ({ page }) => {
  // Reset tokens are stored hashed, so the token can't be read back out of the
  // database — it's minted through the same broker the mail would use.
  const account = mintUser({ resetToken: true })

  await page.goto(`/reset-password/${account.reset_token}?email=${encodeURIComponent(account.email)}`)
  await page.fill('#password', NEW_PASSWORD)
  await page.fill('#password_confirmation', NEW_PASSWORD)
  await page.click('button[type=submit]')

  await page.waitForURL('**/login')
  // Wait for the Login view itself, not just the URL. The reset form has its own
  // #email, and it's still mounted for a tick after the route changes — filling
  // too early types into the dying form and submits an empty login.
  await expect(page.getByRole('heading', { name: 'Welcome Back' })).toBeVisible()

  // The real proof the reset landed: the new password actually authenticates.
  await page.fill('#email', account.email)
  await page.fill('#password', NEW_PASSWORD)
  await page.click('button[type=submit]')

  await page.waitForURL('**/')
  await expect(page.getByText('Hello,')).toBeVisible()
})
