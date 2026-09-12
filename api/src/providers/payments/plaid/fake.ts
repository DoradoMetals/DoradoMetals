import type { PlaidData, PlaidFeedTransaction, PlaidSync } from '#providers/payments/plaid/types.ts'

// The recording fake. `feed()` is what a test uses to say what the Truist
// account reports next; the cursor advances the way Plaid's does, so a sync
// that stops half way resumes where it stopped.

type Call = { what: string; detail: string }

const calls: Call[] = []
const pages: PlaidSync[] = []
const tokens = new Map<string, string>()
let sequence = 0

const next = (prefix: string): string => {
  sequence += 1
  return `${prefix}-${String(sequence).padStart(6, '0')}`
}

export function recorded(): Call[] {
  return calls.slice()
}

export function reset(): void {
  calls.length = 0
  pages.length = 0
  tokens.clear()
  sequence = 0
}

export function feed(added: PlaidFeedTransaction[], has_more = false): void {
  pages.push({
    added,
    modified: [],
    removed: [],
    next_cursor: next('cursor'),
    has_more,
  })
}

export const createLinkToken: PlaidData['createLinkToken'] = async (client_user_id) => {
  calls.push({ what: 'createLinkToken', detail: client_user_id })
  return {
    link_token: next('link-sandbox'),
    expiration: new Date(Date.now() + 30 * 60_000).toISOString(),
  }
}

export const exchangePublicToken: PlaidData['exchangePublicToken'] = async (public_token) => {
  calls.push({ what: 'exchangePublicToken', detail: public_token })
  const access_token = next('access-sandbox')
  tokens.set(public_token, access_token)
  return { access_token, item_id: next('item') }
}

export const createProcessorToken: PlaidData['createProcessorToken'] = async (
  access_token,
  account_id
) => {
  calls.push({ what: 'createProcessorToken', detail: `${access_token}:${account_id}` })
  return { processor_token: next('processor-sandbox') }
}

export const syncTransactions: PlaidData['syncTransactions'] = async (access_token, cursor) => {
  calls.push({ what: 'syncTransactions', detail: `${access_token}:${cursor ?? 'start'}` })
  const page = pages.shift()
  if (!page) {
    return { added: [], modified: [], removed: [], next_cursor: cursor ?? '', has_more: false }
  }
  return page
}

export const verificationKey: PlaidData['verificationKey'] = async (key_id) => {
  calls.push({ what: 'verificationKey', detail: key_id })
  throw new Error('the plaid fake signs nothing - a test supplies its own key pair')
}

export const data: PlaidData = {
  createLinkToken,
  exchangePublicToken,
  createProcessorToken,
  syncTransactions,
  verificationKey,
}
