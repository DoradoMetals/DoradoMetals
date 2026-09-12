// THE SIGN-IN, THROUGH THE SCREENS (Jacob, 2026-09-11: "otp redirected me back
// to sign in").
//
// `shared/tests/auth.setup.ts` signs in through the API - send-otp, read the
// code back, verify - because that is the cheap way to mint a session for the
// other specs. It therefore cannot see anything the SCREENS do, and the two
// bugs behind Jacob's report were both in the screens: the code page bounced to
// /auth/sign-in the moment it emptied the verification it had just spent, and
// the landing page's own guard bounced again because better-auth's reactive
// session had never heard of the session our `verify_code` minted.
//
// So this one drives the browser end to end: a protected page while signed
// out, the phone form, the code screen, and the page it started from coming
// back with a session on it.
//
// WHAT IT NEEDS. A local API with the recording SMS fake selected (no TWILIO_*
// keys) so `GET /api/account/last_code` exists, and `pnpm seed` run against the
// same database. `pnpm seed` prints the id of the disposable purchase order it
// mints: put that in E2E_ORDER_ID and the journey starts on THAT ORDER'S page,
// which is the case Jacob reported. Without it the journey starts on
// `/settings/email`, which is protected too and needs no seeded row - after the
// nuke (ruling 99) there is no admin index and no `/admin/orders` list to use.
import { test, expect } from '@playwright/test'

import { ROLES } from '@/shared/tests/roles'

const API = (process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:5000/api').replace(/\/$/, '')
const START = process.env.E2E_ORDER_ID
  ? `/admin/orders/${process.env.E2E_ORDER_ID}`
  : '/settings/email'

test.describe('signing in through the screens', () => {
  test('a protected page, a code, and the same page signed in', async ({ page, context }) => {
    // `next dev` compiles a route the first time it is asked for, which can
    // outrun the default timeout on a cold server. The journey itself is quick.
    test.setTimeout(120_000)

    // 1. SIGNED OUT ON A PROTECTED PAGE. The guard carries where we were.
    await page.goto(START, { waitUntil: 'domcontentloaded', timeout: 60_000 })
    await page.waitForURL(/\/auth\/sign-in/, { timeout: 60_000 })
    expect(new URL(page.url()).searchParams.get('next')).toBe(START)

    // 2. THE PHONE FORM. The captcha widget belongs here, when one is
    // configured at all; with no site key there is no widget and no script.
    const hasSiteKey = Boolean(process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY)
    await expect(page.getByLabel('Phone')).toBeVisible()
    if (hasSiteKey) await expect(page.getByTestId('turnstile')).toHaveCount(1)

    await page.getByLabel('Phone').fill(ROLES.admin.phone_number.replace('+1', ''))
    if (hasSiteKey) await page.waitForTimeout(3000) // let the widget solve
    await page.getByRole('button', { name: 'Continue' }).click()

    // 3. THE CODE SCREEN. No captcha here, ever - a resend is a send inside the
    // pending window and `send_code` asks for no token for one.
    await page.waitForURL('**/auth/verify', { timeout: 20_000 })
    await expect(page.getByTestId('turnstile')).toHaveCount(0)

    // The field has the cursor already, and the active cell draws a caret.
    await expect(page.getByLabel('One-time code')).toBeFocused()
    await expect(page.getByTestId('otp-caret')).toHaveCount(1)

    // The drawn cell is taller than it is wide (Figma 96:18, 48 x 56).
    const cell = await page.getByTestId('otp-cell').first().boundingBox()
    expect(cell).not.toBeNull()
    expect(cell!.height).toBeGreaterThan(cell!.width)

    // 4. THE CODE, read back from the recording fake the way the harness does.
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

    // 5. BACK WHERE IT STARTED, SIGNED IN. Not /auth/sign-in, which is the bug
    // this spec exists for, and not a second bounce off the page's own guard.
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
