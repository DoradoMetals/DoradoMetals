import type { Rail, TransferState } from '@dorado/contracts'

export type MoovAccount = {
  accountID: string
  displayName: string | null
}

export type MoovBankAccount = {
  bankAccountID: string
  bankName: string | null
  lastFourAccountNumber: string | null
  status: string
}

export type MoovPaymentMethod = {
  paymentMethodID: string
  paymentMethodType: string
  bankName: string | null
  lastFourAccountNumber: string | null
}

export type MoovTransfer = {
  transferID: string
  status: string
  amountCents: number
  failureReason: string | null
}

export type MoovWallet = {
  walletID: string
  availableCents: number
}

export type MoovEvent = {
  eventID: string
  type: string
  transferID: string | null
  status: string | null
  failureReason: string | null
  occurredAt: string
}

export type MoovTransferRequest = {
  sourcePaymentMethodID: string
  destinationPaymentMethodID: string
  amountCents: number
  description: string
  idempotencyKey: string
}

export type MoovBankNumbers = {
  holderName: string
  accountType: string
  routingNumber: string
  accountNumber: string
}

export type MoovRails = {
  createAccount: (displayName: string, email: string) => Promise<MoovAccount>
  linkByProcessorToken: (accountID: string, processorToken: string) => Promise<MoovBankAccount>
  linkByNumbers: (accountID: string, numbers: MoovBankNumbers) => Promise<MoovBankAccount>
  startMicroDeposits: (accountID: string, bankAccountID: string) => Promise<void>
  confirmMicroDeposits: (
    accountID: string,
    bankAccountID: string,
    amounts: number[]
  ) => Promise<MoovBankAccount>
  paymentMethods: (accountID: string) => Promise<MoovPaymentMethod[]>
  createTransfer: (request: MoovTransferRequest) => Promise<MoovTransfer>
  getTransfer: (transferID: string) => Promise<MoovTransfer>
  walletBalance: (accountID: string) => Promise<MoovWallet>
}

export type RailPaymentMethod = { rail: Rail; paymentMethodType: string }

export type MoovStatusMap = { status: string; state: TransferState }
