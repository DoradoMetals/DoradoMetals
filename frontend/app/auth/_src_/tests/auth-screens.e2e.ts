import { expect, test } from '@playwright/test'

test.describe('the auth screens', () => {
  test('sign-in asks for email first, with no phone toggle offered', async ({ page }) => {
    await page.goto('/auth/sign-in')
    await expect(page.getByText('Welcome back')).toBeVisible()
    await expect(
      page.getByText("Enter your email and we'll send you a sign-in code.")
    ).toBeVisible()
    await expect(page.getByRole('button', { name: 'Continue' })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Google' })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Apple' })).toHaveCount(0)
    await expect(page.getByRole('button', { name: 'Facebook' })).toHaveCount(0)
    await expect(page.getByRole('link', { name: 'Send the code there' })).toHaveCount(0)
  })

  test('the phone channel is still reachable at its own URL, coming soon from the primary screen', async ({
    page,
  }) => {
    await page.goto('/auth/sign-in/phone')
    await expect(page.getByText('Welcome back')).toBeVisible()
    await expect(
      page.getByText("Enter your phone number and we'll send you a sign-in code.")
    ).toBeVisible()

    await page.getByRole('link', { name: 'Send the code there' }).click()
    await expect(page).toHaveURL(/\/auth\/sign-in$/)
  })

  test('sign-up asks for the three things, holds the terms, and parks the phone as coming soon', async ({
    page,
  }) => {
    await page.goto('/auth/sign-in')
    await page.getByRole('link', { name: 'Create an account' }).click()
    await expect(page).toHaveURL(/\/auth\/sign-up$/)
    await expect(page.getByText('Create your account')).toBeVisible()
    await expect(page.getByLabel('Name')).toBeVisible()
    await expect(page.getByLabel('Email')).toBeVisible()
    await expect(page.getByLabel('Phone')).toBeVisible()
    await expect(page.getByLabel('Phone')).toBeDisabled()
    await expect(page.getByText('Text sign-in coming soon')).toBeVisible()
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
