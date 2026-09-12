import { test as setup, expect } from '@playwright/test'
import fs from 'node:fs'
import path from 'node:path'

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
