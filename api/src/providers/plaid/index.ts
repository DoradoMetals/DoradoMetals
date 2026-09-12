import * as live from '#providers/plaid/live.ts'
import * as fake from '#providers/plaid/fake.ts'
import type { PlaidData } from '#providers/plaid/types.ts'
import { VERIFICATION_HEADER, keyIdOf, verifyPlaidWebhook } from '#providers/plaid/verify.ts'

export const configured = (): boolean => Boolean(process.env.PLAID_SECRET)

export const data = (): PlaidData => (configured() ? live.data : fake.data)

export async function verify(token: string | undefined, body: string): Promise<boolean> {
  if (!token) return false
  const key_id = keyIdOf(token)
  if (!key_id) return false
  return verifyPlaidWebhook(token, await data().verificationKey(key_id), body)
}

export { VERIFICATION_HEADER }
