import crypto from 'node:crypto'
import type {
  MoovBankAccount,
  MoovEvent,
  MoovPaymentMethod,
  MoovRails,
  MoovTransfer,
} from '#providers/moov/types.ts'

type Call = { what: string; detail: string }

const calls: Call[] = []
const transfers = new Map<string, MoovTransfer>()
const banks = new Map<string, MoovBankAccount>()
const methods = new Map<string, MoovPaymentMethod[]>()
const idempotency = new Map<string, string>()
let sequence = 0

const next = (prefix: string): string => {
  sequence += 1
  return `${prefix}_${String(sequence).padStart(6, '0')}`
}

const record = (what: string, detail: string): void => {
  calls.push({ what, detail })
}

export function recorded(): Call[] {
  return calls.slice()
}

export function reset(): void {
  calls.length = 0
  transfers.clear()
  banks.clear()
  methods.clear()
  idempotency.clear()
  sequence = 0
}

export function offerPaymentMethods(accountID: string, offered: MoovPaymentMethod[]): void {
  methods.set(accountID, offered)
}

export function advance(transferID: string, status: string, failureReason?: string): MoovTransfer {
  const current = transfers.get(transferID)
  if (!current) throw new Error(`the fake holds no moov transfer ${transferID}`)
  const moved = {
    transferID,
    status,
    amountCents: current.amountCents,
    failureReason: failureReason ?? null,
  }
  transfers.set(transferID, moved)
  return moved
}

export function eventFor(transferID: string, status: string, failureReason?: string): MoovEvent {
  return {
    eventID: next('evt'),
    type: `transfer.${status}`,
    transferID,
    status,
    failureReason: failureReason ?? null,
    occurredAt: new Date().toISOString(),
  }
}

export const createAccount: MoovRails['createAccount'] = async (displayName, email) => {
  record('createAccount', email)
  return { accountID: next('acct'), displayName }
}

const bankAccount = (bankName: string, lastFour: string, status: string): MoovBankAccount => ({
  bankAccountID: next('bank'),
  bankName,
  lastFourAccountNumber: lastFour,
  status,
})

export const linkByProcessorToken: MoovRails['linkByProcessorToken'] = async (
  accountID,
  processorToken
) => {
  record('linkByProcessorToken', `${accountID}:${processorToken.slice(0, 12)}`)
  const created = bankAccount('Plaid Test Bank', '4321', 'verified')
  banks.set(created.bankAccountID, created)
  const offered = methods.get(accountID) ?? []
  methods.set(accountID, [
    ...offered,
    {
      paymentMethodID: next('pm'),
      paymentMethodType: 'ach-credit-standard',
      bankName: created.bankName,
      lastFourAccountNumber: created.lastFourAccountNumber,
    },
  ])
  return created
}

export const linkByNumbers: MoovRails['linkByNumbers'] = async (accountID, numbers) => {
  record('linkByNumbers', `${accountID}:${numbers.holderName}`)
  const created = bankAccount('Micro Deposit Bank', numbers.accountNumber.slice(-4), 'new')
  banks.set(created.bankAccountID, created)
  return created
}

export const startMicroDeposits: MoovRails['startMicroDeposits'] = async (
  accountID,
  bankAccountID
) => {
  record('startMicroDeposits', `${accountID}:${bankAccountID}`)
}

export const confirmMicroDeposits: MoovRails['confirmMicroDeposits'] = async (
  accountID,
  bankAccountID,
  amounts
) => {
  record('confirmMicroDeposits', `${accountID}:${bankAccountID}:${amounts.join('/')}`)
  const held = banks.get(bankAccountID)
  const verified = {
    bankAccountID,
    bankName: held?.bankName ?? 'Micro Deposit Bank',
    lastFourAccountNumber: held?.lastFourAccountNumber ?? null,
    status: 'verified',
  }
  banks.set(bankAccountID, verified)
  const offered = methods.get(accountID) ?? []
  methods.set(accountID, [
    ...offered,
    {
      paymentMethodID: next('pm'),
      paymentMethodType: 'ach-credit-standard',
      bankName: verified.bankName,
      lastFourAccountNumber: verified.lastFourAccountNumber,
    },
  ])
  return verified
}

export const paymentMethods: MoovRails['paymentMethods'] = async (accountID) => {
  record('paymentMethods', accountID)
  return methods.get(accountID) ?? []
}

export const createTransfer: MoovRails['createTransfer'] = async (request) => {
  record('createTransfer', `${request.idempotencyKey}:${request.amountCents}`)
  const replayed = idempotency.get(request.idempotencyKey)
  if (replayed) return transfers.get(replayed) as MoovTransfer

  const created = {
    transferID: next('xfer'),
    status: 'pending',
    amountCents: request.amountCents,
    failureReason: null,
  }
  transfers.set(created.transferID, created)
  idempotency.set(request.idempotencyKey, created.transferID)
  return created
}

export const getTransfer: MoovRails['getTransfer'] = async (transferID) => {
  record('getTransfer', transferID)
  const held = transfers.get(transferID)
  if (!held) throw new Error(`the fake holds no moov transfer ${transferID}`)
  return held
}

export const walletBalance: MoovRails['walletBalance'] = async (accountID) => {
  record('walletBalance', accountID)
  return {
    walletID: `wallet_${crypto.createHash('sha1').update(accountID).digest('hex').slice(0, 8)}`,
    availableCents: 5_000_00,
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
