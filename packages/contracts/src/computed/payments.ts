// What a payment rail hands back, and what a caller sends it. A Plaid Link
// token, a Moov payment method, a micro-deposit pair: no table holds any of
// them, and the request bodies are ids plus genuine user input (ruling 43).
import { z } from 'zod/v4'
import { Transfer } from '../payments/transfers.js'
import { InboundTransaction } from '../payments/inbound_transactions.js'
import { BankLink } from '../payments/bank_links.js'
import { User } from '../auth/users.js'

// One order key or the other, never both and never neither - the same CHECK the
// table carries. A refiner is paid the way a customer is (GAP 12).
export const OpenPayoutBody = z
  .object({
    order_id: Transfer.shape.order_id,
    refining_order_id: Transfer.shape.refining_order_id,
    rail: Transfer.shape.rail,
    bank_link_id: Transfer.shape.bank_link_id.optional(),
    details_id: Transfer.shape.details_id.optional(),
  })
  .partial({ order_id: true, refining_order_id: true })
  .strict()
export type OpenPayoutBody = z.infer<typeof OpenPayoutBody>

export const MarkSentBody = z
  .object({ reference: z.string().min(1).max(120) })
  .strict()
export type MarkSentBody = z.infer<typeof MarkSentBody>

export const FailTransferBody = z
  .object({ reason: z.string().min(1).max(400) })
  .strict()
export type FailTransferBody = z.infer<typeof FailTransferBody>

export const OpenChargeBody = z
  .object({
    order_id: Transfer.shape.order_id,
    refining_order_id: Transfer.shape.refining_order_id,
    rail: Transfer.shape.rail,
  })
  .partial({ order_id: true, refining_order_id: true })
  .strict()
export type OpenChargeBody = z.infer<typeof OpenChargeBody>

export const RequestChargeBody = z
  .object({ bank_link_id: BankLink.shape.id })
  .strict()
export type RequestChargeBody = z.infer<typeof RequestChargeBody>

export const RecordWireBody = z
  .object({
    amount: InboundTransaction.shape.amount,
    occurred_at: InboundTransaction.shape.occurred_at,
    counterparty_name: InboundTransaction.shape.counterparty_name,
    memo: InboundTransaction.shape.memo,
    account_ref: InboundTransaction.shape.account_ref,
  })
  .strict()
export type RecordWireBody = z.infer<typeof RecordWireBody>

export const ConfirmMatchBody = z
  .object({ order_id: Transfer.shape.order_id.unwrap() })
  .strict()
export type ConfirmMatchBody = z.infer<typeof ConfirmMatchBody>

export const LinkTokenBody = z
  .object({ user_id: User.shape.id.optional() })
  .strict()
export type LinkTokenBody = z.infer<typeof LinkTokenBody>

export const LinkToken = z.object({
  link_token: z.string(),
  expiration: z.string(),
})
export type LinkToken = z.infer<typeof LinkToken>

export const ExchangeLinkBody = z
  .object({
    public_token: z.string().min(1),
    account_id: z.string().min(1),
    rail: Transfer.shape.rail,
  })
  .strict()
export type ExchangeLinkBody = z.infer<typeof ExchangeLinkBody>

// The one place bank numbers cross this API, and they cross it OUTWARD: Moov
// vaults them and we keep the returned id and the last four. Nothing here is
// stored, logged or returned.
export const MicroDepositsBody = z
  .object({
    holder_name: z.string().min(1).max(120),
    account_type: z.enum(['checking', 'savings']),
    routing_number: z.string().regex(/^\d{9}$/),
    account_number: z.string().regex(/^\d{4,17}$/),
    rail: Transfer.shape.rail,
  })
  .strict()
export type MicroDepositsBody = z.infer<typeof MicroDepositsBody>

// A refiner's account is vaulted at Moov through their own vendor form, so the
// only thing this API records is the reference the vault hands back.
export const VaultedLinkBody = z
  .object({
    user_id: User.shape.id,
    moov_account_id: BankLink.shape.moov_account_id,
    payment_method_id: z.string().min(1),
  })
  .strict()
export type VaultedLinkBody = z.infer<typeof VaultedLinkBody>

export const VerifyMicroDepositsBody = z
  .object({ amounts: z.array(z.number().int().positive()).length(2) })
  .strict()
export type VerifyMicroDepositsBody = z.infer<typeof VerifyMicroDepositsBody>
