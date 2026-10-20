import { requiredEnv } from '#shared/env/required.ts'
import type {
  PlaidData,
  PlaidFeedTransaction,
  PlaidLinkedAccount,
  PlaidVerificationKey,
} from '#providers/plaid/types.ts'
import {
  PLAID_SANDBOX_HOST,
  PLAID_PRODUCTION_HOST,
  PLAID_LINK_TOKEN_CREATE_PATH,
  PLAID_PUBLIC_TOKEN_EXCHANGE_PATH,
  PLAID_PROCESSOR_TOKEN_CREATE_PATH,
  PLAID_TRANSACTIONS_SYNC_PATH,
  PLAID_WEBHOOK_VERIFICATION_KEY_PATH,
  PLAID_ACCOUNTS_GET_PATH,
  PLAID_INSTITUTION_GET_PATH,
  PLAID_CLIENT_ID_HEADER,
  PLAID_SECRET_HEADER,
} from '#providers/plaid/constants.ts'

const HOSTS = new Map([
  ['sandbox', PLAID_SANDBOX_HOST],
  ['production', PLAID_PRODUCTION_HOST],
])

const host = (): string => {
  const env = process.env.PLAID_ENV ?? 'sandbox'
  const resolved = HOSTS.get(env)
  if (!resolved) throw new Error(`PLAID_ENV=${env} is not a Plaid environment`)
  return resolved
}

async function ask<T>(path: string, body: Record<string, unknown>): Promise<T> {
  const response = await fetch(`${host()}${path}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      [PLAID_CLIENT_ID_HEADER]: requiredEnv('PLAID_CLIENT_ID'),
      [PLAID_SECRET_HEADER]: requiredEnv('PLAID_SECRET'),
    },
    body: JSON.stringify(body),
  })
  const text = await response.text()
  if (!response.ok) throw new Error(`plaid refused ${path}: ${response.status}`)
  return (text ? JSON.parse(text) : null) as T
}

const transactionOf = (raw: PlaidFeedTransaction): PlaidFeedTransaction => ({
  transaction_id: raw.transaction_id,
  amount: raw.amount,
  date: raw.date,
  name: raw.name ?? null,
  merchant_name: raw.merchant_name ?? null,
  pending: Boolean(raw.pending),
  account_id: raw.account_id,
})

export const createLinkToken: PlaidData['createLinkToken'] = async (client_user_id) =>
  await ask(PLAID_LINK_TOKEN_CREATE_PATH, {
    user: { client_user_id },
    client_name: 'Dorado Metals Exchange',
    products: ['auth'],
    country_codes: ['US'],
    language: 'en',
  })

export const exchangePublicToken: PlaidData['exchangePublicToken'] = async (public_token) =>
  await ask(PLAID_PUBLIC_TOKEN_EXCHANGE_PATH, { public_token })

export const createProcessorToken: PlaidData['createProcessorToken'] = async (
  access_token,
  account_id
) => await ask(PLAID_PROCESSOR_TOKEN_CREATE_PATH, { access_token, account_id, processor: 'moov' })

export const syncTransactions: PlaidData['syncTransactions'] = async (access_token, cursor) => {
  const raw = await ask<{
    added?: PlaidFeedTransaction[]
    modified?: PlaidFeedTransaction[]
    removed?: { transaction_id: string }[]
    next_cursor?: string
    has_more?: boolean
  }>(PLAID_TRANSACTIONS_SYNC_PATH, cursor ? { access_token, cursor } : { access_token })

  return {
    added: (raw.added ?? []).map(transactionOf),
    modified: (raw.modified ?? []).map(transactionOf),
    removed: (raw.removed ?? []).map((r) => r.transaction_id),
    next_cursor: raw.next_cursor ?? '',
    has_more: Boolean(raw.has_more),
  }
}

export const verificationKey: PlaidData['verificationKey'] = async (key_id) => {
  const raw = await ask<{ key?: PlaidVerificationKey }>(PLAID_WEBHOOK_VERIFICATION_KEY_PATH, {
    key_id,
  })
  if (!raw.key) throw new Error('plaid returned no webhook verification key')
  return raw.key
}

// Hosted Link (ruling 160): Plaid delivers the link by SMS or email. Delivery
// is a beta on Plaid's side and sandbox cannot deliver; the returned URL is
// what our own send would carry instead.
export const createHostedLink: PlaidData['createHostedLink'] = async (
  client_user_id,
  channel,
  to
) =>
  await ask(PLAID_LINK_TOKEN_CREATE_PATH, {
    user:
      channel === 'sms'
        ? { client_user_id, phone_number: to }
        : { client_user_id, email_address: to },
    client_name: 'Dorado Metals Exchange',
    products: ['auth'],
    country_codes: ['US'],
    language: 'en',
    webhook: process.env.PLAID_WEBHOOK_URL,
    hosted_link: { delivery_method: channel, completion_redirect_uri: process.env.FRONTEND_URL },
  })

export const accounts: PlaidData['accounts'] = async (access_token) => {
  const raw = await ask<{
    accounts?: PlaidLinkedAccount[]
    item?: { institution_id?: string | null }
  }>(PLAID_ACCOUNTS_GET_PATH, { access_token })
  const institution_id = raw.item?.institution_id ?? null
  const institution = institution_id
    ? await ask<{ institution?: { name?: string } }>(PLAID_INSTITUTION_GET_PATH, {
        institution_id,
        country_codes: ['US'],
      })
    : null
  return {
    institution_name: institution?.institution?.name ?? null,
    accounts: (raw.accounts ?? []).map((a) => ({
      account_id: a.account_id,
      name: a.name,
      mask: a.mask ?? null,
      verification_status: a.verification_status ?? null,
    })),
  }
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
