import type {
  PlaidAccounts,
  PlaidData,
  PlaidFeedTransaction,
  PlaidHostedChannel,
  PlaidSync,
  PlaidVerificationKey,
} from '#providers/plaid/types.ts'

type Call = { what: string; detail: string }

const calls: Call[] = []
const pages: PlaidSync[] = []
const tokens = new Map<string, string>()
const items = new Map<string, string>()
const accountsByPublic = new Map<string, PlaidAccounts>()
const accountsByAccess = new Map<string, PlaidAccounts>()
const keys = new Map<string, PlaidVerificationKey>()
type Hosted = {
  client_user_id: string
  channel: PlaidHostedChannel
  to: string
  link_token: string
}
const hosted: Hosted[] = []
const RUN = `${process.pid.toString(36)}${Date.now().toString(36)}`
let sequence = 0

const next = (prefix: string): string => {
  sequence += 1
  return `${prefix}-${RUN}-${String(sequence).padStart(6, '0')}`
}

export function recorded(): Call[] {
  return calls.slice()
}

let refuseHosted = 0

export function refuseNextHostedLink(): void {
  refuseHosted += 1
}

export function reset(): void {
  refuseHosted = 0
  calls.length = 0
  pages.length = 0
  tokens.clear()
  items.clear()
  accountsByPublic.clear()
  accountsByAccess.clear()
  keys.clear()
  hosted.length = 0
  sequence = 0
}

export function trustKey(key: PlaidVerificationKey): void {
  keys.set(key.kid, key)
}

export function hostedLinks(): Hosted[] {
  return hosted.slice()
}

export function accountsFor(public_token: string, found: PlaidAccounts): void {
  accountsByPublic.set(public_token, found)
}

export function itemFor(public_token: string): string | undefined {
  return items.get(public_token)
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
  const item_id = next('item')
  tokens.set(public_token, access_token)
  items.set(public_token, item_id)
  const found = accountsByPublic.get(public_token)
  if (found) accountsByAccess.set(access_token, found)
  return { access_token, item_id }
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
  const trusted = keys.get(key_id)
  if (!trusted) throw new Error('the plaid fake signs nothing - a test supplies its own key pair')
  return trusted
}

export const createHostedLink: PlaidData['createHostedLink'] = async (
  client_user_id,
  channel,
  to
) => {
  calls.push({ what: 'createHostedLink', detail: `${client_user_id}:${channel}` })
  if (refuseHosted > 0) {
    refuseHosted -= 1
    throw new Error('INVALID_FIELD: the fake refused the Hosted Link')
  }
  const link_token = next('link-sandbox')
  hosted.push({ client_user_id, channel, to, link_token })
  return { link_token, hosted_link_url: `https://hosted.plaid.test/${link_token}` }
}

export const accounts: PlaidData['accounts'] = async (access_token) => {
  calls.push({ what: 'accounts', detail: access_token })
  return accountsByAccess.get(access_token) ?? { institution_name: null, accounts: [] }
}

export const data: PlaidData = {
  createLinkToken,
  exchangePublicToken,
  createProcessorToken,
  syncTransactions,
  verificationKey,
  createHostedLink,
  accounts,
}
