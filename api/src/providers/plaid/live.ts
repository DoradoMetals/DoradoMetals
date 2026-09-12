import { requiredEnv } from '#shared/env/required.ts'
import type {
  PlaidData,
  PlaidFeedTransaction,
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

export const data: PlaidData = {
  createLinkToken,
  exchangePublicToken,
  createProcessorToken,
  syncTransactions,
  verificationKey,
}
