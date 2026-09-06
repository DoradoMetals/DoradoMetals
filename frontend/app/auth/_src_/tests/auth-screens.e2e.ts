import { expect, test } from '@playwright/test'

// The passwordless screens, in a real browser, signed out.
//
// WHAT IS NOT HERE: a submitted sign-in. `POST /api/account/send_code` runs the
// captcha and a headless browser is exactly what it refuses, so a spec that
// submitted would fail for the anti-bot check doing its job. The session the
// authed specs reuse is minted through the API in `shared/tests/auth.setup.ts`.
// What a browser can prove is that every screen renders, that the two channels
// reach each other, and that a code screen with no code in flight sends the
// customer back to the start rather than sitting there empty.

test.describe('the auth screens', () => {
  test('sign-in is phone first and offers email as the equal fallback', async ({ page }) => {
    await page.goto('/auth/sign-in')
    await expect(page.getByText('Welcome back')).toBeVisible()
    await expect(
      page.getByText("Enter your phone number and we'll send you a sign-in code.")
    ).toBeVisible()
    await expect(page.getByRole('button', { name: 'Continue' })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Google' })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Apple' })).toHaveCount(0)
    await expect(page.getByRole('button', { name: 'Facebook' })).toHaveCount(0)

    await page.getByRole('link', { name: 'Send the code there' }).click()
    await expect(page).toHaveURL(/\/auth\/sign-in\/email$/)
    await expect(page.getByText("Enter your email and we'll send you a sign-in code.")).toBeVisible()

    await page.getByRole('link', { name: 'Send the code there' }).click()
    await expect(page).toHaveURL(/\/auth\/sign-in$/)
  })

  test('sign-up asks for the three things and holds the terms', async ({ page }) => {
    await page.goto('/auth/sign-in')
    await page.getByRole('link', { name: 'Create an account' }).click()
    await expect(page).toHaveURL(/\/auth\/sign-up$/)
    await expect(page.getByText('Create your account')).toBeVisible()
    await expect(page.getByLabel('Name')).toBeVisible()
    await expect(page.getByLabel('Email')).toBeVisible()
    await expect(page.getByLabel('Phone')).toBeVisible()
    await expect(page.getByRole('button', { name: 'Create account' })).toBeDisabled()
  })

  test('a code screen with nothing in flight returns to sign-in', async ({ page }) => {
    await page.goto('/auth/verify')
    await expect(page).toHaveURL(/\/auth\/sign-in$/)
  })

  test('session expired explains itself and offers the way back', async ({ page }) => {
    await page.goto('/auth/session-expired')
    await expect(page.getByText("You've been signed out")).toBeVisible()
    await page.getByRole('button', { name: 'Sign in again' }).click()
    await expect(page).toHaveURL(/\/auth\/sign-in$/)
  })

  test('locked names the support route', async ({ page }) => {
    await page.goto('/auth/locked')
    await expect(page.getByText('Too many attempts')).toBeVisible()
    await expect(page.getByRole('link', { name: 'Contact support' })).toBeVisible()
  })

  test('the auth surface carries no site nav or footer', async ({ page }) => {
    await page.goto('/auth/sign-in')
    await expect(page.getByRole('button', { name: 'Back' })).toBeVisible()
    await expect(page.locator('footer')).toHaveCount(0)
  })
})
