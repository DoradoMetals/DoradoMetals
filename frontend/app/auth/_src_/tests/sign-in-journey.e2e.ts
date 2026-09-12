import { test, expect } from '@playwright/test'

import { ROLES } from '@/shared/tests/roles'

const API = (process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:5000/api').replace(/\/$/, '')
const START = process.env.E2E_ORDER_ID
  ? `/admin/orders/${process.env.E2E_ORDER_ID}`
  : '/settings/email'

test.describe('signing in through the screens', () => {
  test('a protected page, a code, and the same page signed in', async ({ page, context }) => {
    test.setTimeout(120_000)

    await page.goto(START, { waitUntil: 'domcontentloaded', timeout: 60_000 })
    await page.waitForURL(/\/auth\/sign-in/, { timeout: 60_000 })
    expect(new URL(page.url()).searchParams.get('next')).toBe(START)

    const hasSiteKey = Boolean(process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY)
    await expect(page.getByLabel('Phone')).toBeVisible()
    if (hasSiteKey) await expect(page.getByTestId('turnstile')).toHaveCount(1)

    await page.getByLabel('Phone').fill(ROLES.admin.phone_number.replace('+1', ''))
    if (hasSiteKey) await page.waitForTimeout(3000)
    await page.getByRole('button', { name: 'Continue' }).click()

    await page.waitForURL('**/auth/verify', { timeout: 20_000 })
    await expect(page.getByTestId('turnstile')).toHaveCount(0)

    await expect(page.getByLabel('One-time code')).toBeFocused()
    await expect(page.getByTestId('otp-caret')).toHaveCount(1)

    const cell = await page.getByTestId('otp-cell').first().boundingBox()
    expect(cell).not.toBeNull()
    expect(cell!.height).toBeGreaterThan(cell!.width)

    const read = await context.request.get(`${API}/account/last_code`, {
      params: { number: ROLES.admin.phone_number },
    })
    expect(
      read.ok(),
      `/account/last_code answered ${read.status()} - is the SMS fake the provider?`
    ).toBeTruthy()
    const { code } = (await read.json()) as { code: string | null }
    expect(code, 'no code was recorded - has `pnpm seed` been run?').toBeTruthy()

    await page.getByLabel('One-time code').fill(code!)
    await page.getByRole('button', { name: 'Verify' }).click()

    await page.waitForURL(`**${START}`, { timeout: 60_000 })
    await page.waitForTimeout(2000)
    expect(page.url()).toContain(START)

    const cookies = await context.cookies()
    expect(
      cookies.some((c) => c.name.includes('session')),
      'no session cookie was written'
    ).toBeTruthy()
    await expect(page.getByRole('link', { name: 'Sign in' })).toHaveCount(0)
  })
})
