process.env.NODE_ENV = 'test'

import '#env'
import { assertSafeDatabase } from './lib/safe-database.ts'

console.log(`database: ${assertSafeDatabase('seed-e2e-users', process.env.DATABASE_URL)}`)

import pool from '#pool'
import query from '#shared/db/query.ts'
import { auth } from '#accounts/auth/client.ts'
import * as fakeSms from '#providers/sms/fake.ts'

// There are no passwords any more (ruling 91). A seeded account gets a
// VERIFIED phone number, and the harness signs in the way a customer does:
// send a code, read it back from the recording fake, verify it.
export const E2E_USERS = {
  admin: {
    email: 'e2e-admin@example.invalid',
    phone_number: '+15555550100',
    name: 'E2E Admin',
    role: 'admin',
  },
  customer: {
    email: 'e2e-customer@example.invalid',
    phone_number: '+15555550101',
    name: 'E2E Customer',
    role: 'user',
  },
}

async function ensure({ email, phone_number, name, role }) {
  const { rows } = await query(`SELECT id FROM auth.users WHERE email = $1`, [email])

  await query(
    `INSERT INTO auth.users (email, name, role, "emailVerified", phone_number, phone_number_verified)
     VALUES ($1, $2, $3, true, $4, true)
     ON CONFLICT (email) DO UPDATE SET
       name                  = EXCLUDED.name,
       role                  = EXCLUDED.role,
       "emailVerified"       = true,
       phone_number          = EXCLUDED.phone_number,
       phone_number_verified = true`,
    [email, name, role, phone_number]
  )

  const after = await query(`SELECT id FROM auth.users WHERE email = $1`, [email])
  if (!after.rows.length) throw new Error(`${email} was not created`)

  return { email, id: after.rows[0].id, created: !rows.length }
}

const results = []
for (const user of Object.values(E2E_USERS)) results.push(await ensure(user))

for (const r of results) {
  console.log(`  ${r.created ? 'created' : 'already present'}  ${r.email}  ${r.id}`)
}

for (const { email, phone_number } of Object.values(E2E_USERS)) {
  await auth.api.sendPhoneNumberOTP({ body: { phoneNumber: phone_number } })
  const code = fakeSms.lastCodeTo(phone_number)
  if (!code) throw new Error(`no code was recorded for ${phone_number} - is SMS_PROVIDER=fake?`)
  const res = await auth.api.verifyPhoneNumber({ body: { phoneNumber: phone_number, code } })
  if (!res?.user?.id) throw new Error(`${email} exists but cannot sign in by code`)
  console.log(`  sign-in ok    ${email}  (${phone_number})`)
}

await pool.end()
