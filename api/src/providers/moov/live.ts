import { requiredEnv } from '#shared/env/required.ts'
import type {
  MoovAccount,
  MoovBankAccount,
  MoovBankNumbers,
  MoovPaymentMethod,
  MoovRails,
  MoovTransfer,
  MoovTransferRequest,
  MoovWallet,
} from '#providers/moov/types.ts'
import {
  MOOV_DEFAULT_HOST,
  MOOV_API_VERSION,
  MOOV_OAUTH_TOKEN_PATH,
  MOOV_ACCOUNTS_PATH,
  MOOV_BANK_ACCOUNTS_SEGMENT,
  MOOV_MICRO_DEPOSITS_SEGMENT,
  MOOV_PAYMENT_METHODS_SEGMENT,
  MOOV_TRANSFERS_SEGMENT,
  MOOV_WALLETS_SEGMENT,
  MOOV_VERSION_HEADER,
  MOOV_IDEMPOTENCY_KEY_HEADER,
} from '#providers/moov/constants.ts'

const HOST = process.env.MOOV_HOST ?? MOOV_DEFAULT_HOST
const VERSION = MOOV_API_VERSION

type TokenResponse = { access_token?: string; expires_in?: number }

let token: string | null = null
let tokenExpiresAt = 0

async function accessToken(now = Date.now()): Promise<string> {
  if (token && now < tokenExpiresAt) return token
  const body = new URLSearchParams({
    grant_type: 'client_credentials',
    client_id: requiredEnv('MOOV_PUBLIC_KEY'),
    client_secret: requiredEnv('MOOV_SECRET_KEY'),
    scope: `${MOOV_ACCOUNTS_PATH}.read ${MOOV_ACCOUNTS_PATH}.write /${MOOV_TRANSFERS_SEGMENT}.read /${MOOV_TRANSFERS_SEGMENT}.write ${MOOV_ACCOUNTS_PATH}/${requiredEnv('MOOV_ACCOUNT_ID')}/${MOOV_BANK_ACCOUNTS_SEGMENT}.read ${MOOV_ACCOUNTS_PATH}/${requiredEnv('MOOV_ACCOUNT_ID')}/${MOOV_BANK_ACCOUNTS_SEGMENT}.write`,
  })
  const response = await fetch(`${HOST}${MOOV_OAUTH_TOKEN_PATH}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: body.toString(),
  })
  const parsed = (await response.json()) as TokenResponse
  if (!response.ok || !parsed.access_token) {
    throw new Error(`moov refused a token: ${response.status}`)
  }
  token = parsed.access_token
  tokenExpiresAt = now + (parsed.expires_in ?? 300) * 1000 - 30_000
  return token
}

async function ask<T>(
  method: string,
  path: string,
  body?: unknown,
  idempotencyKey?: string
): Promise<T> {
  const headers = new Headers({
    Authorization: `Bearer ${await accessToken()}`,
    [MOOV_VERSION_HEADER]: VERSION,
    Accept: 'application/json',
  })
  if (body !== undefined) headers.set('Content-Type', 'application/json')
  if (idempotencyKey) headers.set(MOOV_IDEMPOTENCY_KEY_HEADER, idempotencyKey)

  const response = await fetch(`${HOST}${path}`, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  })
  const text = await response.text()
  if (!response.ok) throw new Error(`moov refused ${method} ${path}: ${response.status}`)
  return (text ? JSON.parse(text) : null) as T
}

const platform = (): string => requiredEnv('MOOV_ACCOUNT_ID')

type RawBankAccount = {
  bankAccountID?: string
  bankName?: string
  lastFourAccountNumber?: string
  status?: string
}

const bankAccountOf = (raw: RawBankAccount): MoovBankAccount => ({
  bankAccountID: raw.bankAccountID ?? '',
  bankName: raw.bankName ?? null,
  lastFourAccountNumber: raw.lastFourAccountNumber ?? null,
  status: raw.status ?? 'new',
})

type RawPaymentMethod = {
  paymentMethodID?: string
  paymentMethodType?: string
  bankAccount?: RawBankAccount
}

type RawTransfer = {
  transferID?: string
  status?: string
  amount?: { value?: number }
  failureReason?: string
}

const transferOf = (raw: RawTransfer): MoovTransfer => ({
  transferID: raw.transferID ?? '',
  status: raw.status ?? 'created',
  amountCents: raw.amount?.value ?? 0,
  failureReason: raw.failureReason ?? null,
})

export const createAccount: MoovRails['createAccount'] = async (displayName, email) => {
  const raw = await ask<{ accountID?: string; displayName?: string }>('POST', MOOV_ACCOUNTS_PATH, {
    accountType: 'individual',
    profile: { individual: { name: { firstName: displayName, lastName: '' }, email } },
  })
  return { accountID: raw.accountID ?? '', displayName: raw.displayName ?? displayName }
}

export const linkByProcessorToken: MoovRails['linkByProcessorToken'] = async (
  accountID,
  processorToken
) =>
  bankAccountOf(
    await ask<RawBankAccount>(
      'POST',
      `${MOOV_ACCOUNTS_PATH}/${accountID}/${MOOV_BANK_ACCOUNTS_SEGMENT}`,
      {
        plaid: { token: processorToken },
      }
    )
  )

export const linkByNumbers: MoovRails['linkByNumbers'] = async (accountID, numbers) =>
  bankAccountOf(
    await ask<RawBankAccount>(
      'POST',
      `${MOOV_ACCOUNTS_PATH}/${accountID}/${MOOV_BANK_ACCOUNTS_SEGMENT}`,
      {
        account: {
          holderName: numbers.holderName,
          holderType: 'individual',
          accountNumber: numbers.accountNumber,
          routingNumber: numbers.routingNumber,
          bankAccountType: numbers.accountType,
        },
      }
    )
  )

export const startMicroDeposits: MoovRails['startMicroDeposits'] = async (
  accountID,
  bankAccountID
) => {
  await ask(
    'POST',
    `${MOOV_ACCOUNTS_PATH}/${accountID}/${MOOV_BANK_ACCOUNTS_SEGMENT}/${bankAccountID}/${MOOV_MICRO_DEPOSITS_SEGMENT}`
  )
}

export const confirmMicroDeposits: MoovRails['confirmMicroDeposits'] = async (
  accountID,
  bankAccountID,
  amounts
) =>
  bankAccountOf(
    await ask<RawBankAccount>(
      'PUT',
      `${MOOV_ACCOUNTS_PATH}/${accountID}/${MOOV_BANK_ACCOUNTS_SEGMENT}/${bankAccountID}/${MOOV_MICRO_DEPOSITS_SEGMENT}`,
      { amounts }
    )
  )

export const paymentMethods: MoovRails['paymentMethods'] = async (accountID) => {
  const raw = await ask<RawPaymentMethod[]>(
    'GET',
    `${MOOV_ACCOUNTS_PATH}/${accountID}/${MOOV_PAYMENT_METHODS_SEGMENT}`
  )
  return (raw ?? []).map((method) => ({
    paymentMethodID: method.paymentMethodID ?? '',
    paymentMethodType: method.paymentMethodType ?? '',
    bankName: method.bankAccount?.bankName ?? null,
    lastFourAccountNumber: method.bankAccount?.lastFourAccountNumber ?? null,
  }))
}

export const createTransfer: MoovRails['createTransfer'] = async (
  request: MoovTransferRequest
) =>
  transferOf(
    await ask<RawTransfer>(
      'POST',
      `${MOOV_ACCOUNTS_PATH}/${platform()}/${MOOV_TRANSFERS_SEGMENT}`,
      {
        source: { paymentMethodID: request.sourcePaymentMethodID },
        destination: { paymentMethodID: request.destinationPaymentMethodID },
        amount: { currency: 'USD', value: request.amountCents },
        description: request.description,
      },
      request.idempotencyKey
    )
  )

export const getTransfer: MoovRails['getTransfer'] = async (transferID) =>
  transferOf(
    await ask<RawTransfer>(
      'GET',
      `${MOOV_ACCOUNTS_PATH}/${platform()}/${MOOV_TRANSFERS_SEGMENT}/${transferID}`
    )
  )

export const walletBalance: MoovRails['walletBalance'] = async (accountID) => {
  const raw = await ask<{ walletID?: string; availableBalance?: { value?: number } }[]>(
    'GET',
    `${MOOV_ACCOUNTS_PATH}/${accountID}/${MOOV_WALLETS_SEGMENT}`
  )
  const first = (raw ?? [])[0]
  return {
    walletID: first?.walletID ?? '',
    availableCents: first?.availableBalance?.value ?? 0,
  }
}

export const rails: MoovRails = {
  createAccount,
  linkByProcessorToken,
  linkByNumbers,
  startMicroDeposits,
  confirmMicroDeposits,
  paymentMethods,
  createTransfer,
  getTransfer,
  walletBalance,
}

export function resetToken(): void {
  token = null
  tokenExpiresAt = 0
}

export type { MoovAccount, MoovWallet }
