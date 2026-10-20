import * as live from '#providers/plaid/live.ts'
import * as fake from '#providers/plaid/fake.ts'

export const stageFakeAccounts = fake.accountsFor
import type { PlaidData, PlaidEvent } from '#providers/plaid/types.ts'
import { VERIFICATION_HEADER, keyIdOf, verifyPlaidWebhook } from '#providers/plaid/verify.ts'

export const configured = (): boolean => Boolean(process.env.PLAID_SECRET)

// The fake completes a Hosted Link for end-to-end runs. Never in production,
// and never when a real Plaid is configured.
export const fakeCompletionAllowed = (): boolean =>
  !configured() && process.env.NODE_ENV !== 'production'

export const data = (): PlaidData => (configured() ? live.data : fake.data)

export async function verify(token: string | undefined, body: string): Promise<boolean> {
  if (!token) return false
  const key_id = keyIdOf(token)
  if (!key_id) return false
  return verifyPlaidWebhook(token, await data().verificationKey(key_id), body)
}

export { VERIFICATION_HEADER }

type RawEvent = {
  webhook_type?: string
  webhook_code?: string
  status?: string
  link_token?: string
  public_tokens?: string[]
  public_token?: string
  item_id?: string
  account_id?: string
}

export function eventFrom(payload: string): PlaidEvent | null {
  const raw = JSON.parse(payload) as RawEvent
  if (!raw.webhook_type || !raw.webhook_code) return null
  return {
    webhook_type: raw.webhook_type,
    webhook_code: raw.webhook_code,
    status: raw.status ?? null,
    link_token: raw.link_token ?? null,
    public_token: raw.public_tokens?.[0] ?? raw.public_token ?? null,
    item_id: raw.item_id ?? null,
    account_id: raw.account_id ?? null,
  }
}
