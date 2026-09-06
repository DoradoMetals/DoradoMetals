import { test as setup, expect } from '@playwright/test'
import fs from 'node:fs'
import path from 'node:path'

// Signs the two e2e accounts in and saves their session, once, before the rest
// of the suite runs. Playwright reuses the saved state per role, so no other
// spec pays the cost of logging in.
//
// THROUGH OTP, THROUGH THE API (ruling 91). There are no passwords any more:
// a sign-in is send-a-code, read-the-code, verify. The code is read back from
// the recording SMS fake through `GET /api/account/last_code`, a route that
// only exists while that fake is the selected provider and NODE_ENV is not
// production - so nothing here is a bypass that could ship.
//
// WHY NOT THE FORM: `POST /api/account/send_code` runs the captcha, and driven
// headlessly it refuses - which is its job. The code is asked for through
// better-auth's own phone-number plugin endpoint instead, which is the same
// sender the app's own send_code reaches, minus the anti-bot step. The session
// is then minted by the real `/api/account/verify_code`.
//
// WHAT THIS COSTS, so it is not discovered later: the sign-in FORM is not
// exercised here. It needs its own spec, tolerant of the captcha being
// unpredictable, and that should be the only place that pays the price.
const API = (process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:5000/api').replace(/\/$/, '')

import { ROLES, statePath } from './roles'

for (const [role, account] of Object.entries(ROLES)) {
  setup(`authenticate as ${role}`, async ({ playwright, baseURL }) => {
    const api = await playwright.request.newContext({ baseURL })

    const sent = await api.post(`${API}/auth/phone-number/send-otp`, {
      data: { phoneNumber: account.phone_number },
      headers: { 'Content-Type': 'application/json' },
    })
    expect(
      sent.ok(),
      `could not send a code to ${account.phone_number} (${sent.status()}). ` +
        `Has the seed been run?\n  pnpm --filter @dorado/api seed:e2e`
    ).toBeTruthy()

    const read = await api.get(`${API}/account/last_code`, {
      params: { number: account.phone_number },
    })
    expect(
      read.ok(),
      `/account/last_code answered ${read.status()} - is SMS_PROVIDER the recording fake?`
    ).toBeTruthy()
    const { code } = (await read.json()) as { code: string | null }
    expect(code, `no code was recorded for ${account.phone_number}`).toBeTruthy()

    const verified = await api.post(`${API}/account/verify_code`, {
      data: { channel: 'sms', phone_number: account.phone_number, code },
      headers: { 'Content-Type': 'application/json' },
    })
    expect(
      verified.ok(),
      `verify_code failed for ${account.email} (${verified.status()})`
    ).toBeTruthy()
    expect((await verified.json()).status, 'the seeded code was not accepted').toBe('verified')

    const state = await api.storageState()
    expect(
      state.cookies.length,
      'sign-in returned no cookies - there is no session to reuse'
    ).toBeGreaterThan(0)

    // THE SWEEPER. Every spec that creates addresses cleans up after itself -
    // until a run crashes mid-test and its afterEach never fires, which is how
    // a leaked e2e-crud- row broke an unrelated assertion a day later. Setup
    // runs before every project, so the suite starts from a clean slate no
    // matter how the previous run ended. e2e- prefixed labels only; a real
    // row can never match.
    if (role === 'customer') {
      const listed = await api.get(`${API}/addresses/get`)
      if (listed.ok()) {
        for (const address of await listed.json()) {
          const label = address?.name ?? address?.label ?? ''
          if (typeof label === 'string' && label.startsWith('e2e-')) {
            await api.delete(`${API}/addresses/delete`, { data: { address } }).catch(() => {})
          }
        }
      }
    }

    // Written under the frontend's own origin so the browser sends them: the
    // cookie comes back scoped to the API host, and the app is served from
    // another port.
    const origin = new URL(baseURL ?? 'http://localhost:3000')
    const cookies = state.cookies.map((c) => ({ ...c, domain: origin.hostname, path: '/' }))

    fs.mkdirSync(path.dirname(statePath(role as keyof typeof ROLES)), { recursive: true })
    fs.writeFileSync(
      statePath(role as keyof typeof ROLES),
      JSON.stringify({ cookies, origins: [] }, null, 2)
    )

    await api.dispose()
  })
}
