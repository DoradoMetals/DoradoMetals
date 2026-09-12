import type { PoolClient } from 'pg'
import { auth } from '#accounts/auth/client.ts'
import * as rules from '#accounts/auth/rules.ts'

export const CODE = '418209'

export type Dispatch = { channel: 'sms' | 'email'; to: string }

export const dispatched: Dispatch[] = []

const api = auth.api as unknown as Record<string, unknown>
const real = new Map<string, unknown>()

export async function mintFor(c: PoolClient, identifier: string, code = CODE): Promise<void> {
  await c.query(
    `INSERT INTO auth.verification (identifier, value, "expiresAt")
     VALUES ($1, $2, (now() at time zone 'UTC') + interval '10 minutes')`,
    [identifier, `${code}:0`]
  )
}

const cookies = () =>
  ({
    headers: new Headers({ 'set-cookie': 'dorado.session_token=stub; Path=/; HttpOnly' }),
    response: {},
  }) as never

export function stubAuthApi(c: PoolClient): void {
  dispatched.length = 0
  for (const name of [
    'sendPhoneNumberOTP',
    'sendVerificationOTP',
    'createVerificationOTP',
    'verifyPhoneNumber',
    'signInEmailOTP',
  ]) {
    if (!real.has(name)) real.set(name, api[name])
  }

  api.sendPhoneNumberOTP = async ({ body }: { body: { phoneNumber: string } }) => {
    dispatched.push({ channel: 'sms', to: body.phoneNumber })
    await mintFor(c, body.phoneNumber)
    return { message: 'code sent' }
  }

  api.sendVerificationOTP = async ({ body }: { body: { email: string; type: string } }) => {
    dispatched.push({ channel: 'email', to: body.email })
    await mintFor(c, rules.identifierFor(body.type, body.email))
    return { success: true }
  }

  api.createVerificationOTP = async ({ body }: { body: { email: string; type: string } }) => {
    await mintFor(c, rules.identifierFor(body.type, body.email))
    return CODE
  }

  api.verifyPhoneNumber = async ({ body }: { body: { phoneNumber: string } }) => {
    const found = await c.query(`SELECT id FROM auth.users WHERE phone_number = $1`, [
      body.phoneNumber,
    ])
    if (found.rows.length === 0) {
      await c.query(
        `INSERT INTO auth.users (email, name, role, "emailVerified", phone_number,
                                 phone_number_verified)
         VALUES ($1, $2, 'user', false, $3, true)`,
        [rules.temporaryEmailFor(body.phoneNumber), body.phoneNumber, body.phoneNumber]
      )
    } else {
      await c.query(`UPDATE auth.users SET phone_number_verified = true WHERE phone_number = $1`, [
        body.phoneNumber,
      ])
    }
    await c.query(`DELETE FROM auth.verification WHERE identifier = $1`, [body.phoneNumber])
    return cookies()
  }

  api.signInEmailOTP = async ({ body }: { body: { email: string } }) => {
    await c.query(`DELETE FROM auth.verification WHERE identifier = $1`, [
      rules.identifierFor(rules.SIGN_IN_OTP_TYPE, body.email),
    ])
    return cookies()
  }
}

export function restoreAuthApi(): void {
  for (const [name, fn] of real) api[name] = fn
  real.clear()
  dispatched.length = 0
}

export async function aSessionRow(c: PoolClient, user_id: string, agoSeconds = 0): Promise<string> {
  const { rows } = await c.query<{ id: string }>(
    `INSERT INTO auth.sessions ("userId", token, "expiresAt", "createdAt")
     VALUES ($1, gen_random_uuid()::text, now() + interval '7 days',
             (now() at time zone 'UTC') - ($2 || ' seconds')::interval)
     RETURNING id`,
    [user_id, String(agoSeconds)]
  )
  return rows[0]!.id
}
