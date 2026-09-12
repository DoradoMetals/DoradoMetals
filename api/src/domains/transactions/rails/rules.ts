import { Conflict, Invalid, NotFound } from '#shared/errors.ts'
import type {
  BankLink,
  Direction,
  InboundTransaction,
  PaymentView,
  Rail,
  RefiningDirection,
  Transfer,
  TransferKind,
  TransferState,
} from '@dorado/contracts'

const RANK = new Map<TransferState, number>([
  ['Not sent', 0],
  ['Due', 0],
  ['Processing', 1],
  ['Sent', 2],
  ['Received', 2],
  ['Failed', 3],
])

const SETTLED = new Map<TransferKind, TransferState>([
  ['payout', 'Sent'],
  ['charge', 'Received'],
])

const OPENING = new Map<TransferKind, TransferState>([
  ['payout', 'Not sent'],
  ['charge', 'Due'],
])

const MOOV = new Map<string, 'moving' | 'settled' | 'failed'>([
  ['created', 'moving'],
  ['queued', 'moving'],
  ['pending', 'moving'],
  ['completed', 'settled'],
  ['failed', 'failed'],
  ['reversed', 'failed'],
  ['canceled', 'failed'],
])

export function openingState(kind: TransferKind): TransferState {
  return OPENING.get(kind) as TransferState
}

export function settledState(kind: TransferKind): TransferState {
  return SETTLED.get(kind) as TransferState
}

export function movesForward(from: TransferState, to: TransferState): boolean {
  if (from === to) return false
  return (RANK.get(to) ?? 0) > (RANK.get(from) ?? 0)
}

export function stateFromMoov(
  kind: TransferKind,
  status: string | null
): TransferState | undefined {
  const verdict = MOOV.get((status ?? '').toLowerCase())
  if (!verdict) return undefined
  if (verdict === 'moving') return 'Processing'
  if (verdict === 'failed') return 'Failed'
  return settledState(kind)
}

export function centsOf(amount: number): number {
  return Math.round(Number(amount) * 100)
}

export function referenceFor(direction: Direction | null, number: number): string {
  return `${direction === 'sale' ? 'SO' : 'PO'}-${number}`
}

export function refiningReferenceFor(direction: RefiningDirection, number: number): string {
  return `${direction === 'buy' ? 'RP' : 'RS'}-${number}`
}

export function assertOneOrder(
  order_id: string | null | undefined,
  refining_order_id: string | null | undefined
): void {
  if (Boolean(order_id) === Boolean(refining_order_id)) {
    throw new Invalid('a payment names an order_id or a refining_order_id, and exactly one')
  }
}

export function transferKeyFor(transfer_id: string): string {
  return `transfer:${transfer_id}`
}

export function assertTransfer(id: string, transfer: Transfer | undefined): Transfer {
  if (!transfer) throw new NotFound(`no payment ${id}`)
  return transfer
}

export function assertOpenable(order_id: string, amount: number | null | undefined): number {
  const owed = Number(amount ?? 0)
  if (!(owed > 0)) {
    throw new Invalid(`order ${order_id} owes nothing, so there is no payment to open`)
  }
  return owed
}

export function assertKind(transfer: Transfer, kind: TransferKind): Transfer {
  if (transfer.kind !== kind) {
    throw new Invalid(`payment ${transfer.id} is a ${transfer.kind}, not a ${kind}`)
  }
  return transfer
}

export function assertSendable(transfer: Transfer): Transfer {
  if (!isOpening(transfer)) {
    throw new Conflict(
      `payment ${transfer.id} is ${transfer.state} - only a ${openingState(transfer.kind)} payment may be sent`
    )
  }
  return transfer
}

export function isOpening(transfer: Transfer): boolean {
  return transfer.state === openingState(transfer.kind)
}

export function assertOverrideReason(
  override_reason: string | null | undefined,
  what: string
): asserts override_reason is string {
  if (!override_reason || override_reason.trim().length < 10) {
    throw new Conflict(
      `${what}. Money leaves twice or in excess here, so this needs a written ` +
        `override_reason of at least 10 characters AND a session stepped up in the last ` +
        `five minutes (POST /api/account/step_up)`
    )
  }
}

export function overrideFor(transfer: Transfer): string | null {
  if (isOpening(transfer)) return null
  return `This payment is ${transfer.state} - sending it again moves the money twice`
}

export function payoutOverrideFor(owed: number, amount: number | null | undefined): string | null {
  if (amount == null) return null
  if (Number(amount) <= Number(owed)) return null
  return `${amount} is more than the ${owed} this order owes`
}

export function assertWritten(id: string, written: boolean): void {
  if (!written) {
    throw new Conflict(`payment ${id} changed under this request - nothing was written`)
  }
}

export function assertPayable(transfer: Transfer, link: BankLink | undefined): BankLink {
  if (!link) throw new NotFound(`payment ${transfer.id} names no bank account to pay`)
  if (link.status !== 'verified') {
    throw new Conflict(`bank account ${link.id} is ${link.status}, so nothing may be sent to it`)
  }
  if (!link.payment_method_id) {
    throw new Conflict(`bank account ${link.id} has no Moov payment method yet`)
  }
  return link
}

export function assertLink(id: string, link: BankLink | undefined): BankLink {
  if (!link) throw new NotFound(`no bank link ${id}`)
  return link
}

export function assertOwned(link: BankLink, user_id: string): BankLink {
  if (link.user_id !== user_id) throw new NotFound(`no bank link ${link.id}`)
  return link
}

export function assertInbound(id: string, row: InboundTransaction | undefined): InboundTransaction {
  if (!row) throw new NotFound(`no inbound transaction ${id}`)
  return row
}

export function assertUnmatched(row: InboundTransaction): InboundTransaction {
  if (row.state !== 'Unmatched') {
    throw new Conflict(`inbound transaction ${row.id} is already ${row.state}`)
  }
  return row
}

export function assertMatched(row: InboundTransaction): InboundTransaction {
  if (row.state !== 'Matched') {
    throw new Conflict(`inbound transaction ${row.id} is not matched to anything`)
  }
  return row
}

export function assertRail(rail: Rail, kind: TransferKind): Rail {
  if (kind === 'payout' && rail === 'CARD') {
    throw new Invalid('a payout is never sent to a card on these rails')
  }
  return rail
}

export function assertRecorded<T>(what: string, row: T | undefined): T {
  if (row === undefined) throw new Conflict(`${what} was not written`)
  return row
}

export function assertWalletMethod(payment_method_id: string | undefined): string {
  if (!payment_method_id) {
    throw new Invalid(
      'MOOV_WALLET_PAYMENT_METHOD_ID is not set - there is no wallet to move money from'
    )
  }
  return payment_method_id
}

export function assertMoovAccount(moov_account_id: string | undefined): string {
  if (!moov_account_id) {
    throw new Invalid('MOOV_ACCOUNT_ID is not set - no Moov account owns this link')
  }
  return moov_account_id
}

export function assertFeedToken(access_token: string | undefined): string {
  if (!access_token) {
    throw new Invalid('PLAID_TRUIST_ACCESS_TOKEN is not set - there is no feed to read')
  }
  return access_token
}

export function assertViewable(order_id: string, view: PaymentView | undefined): PaymentView {
  if (!view) throw new NotFound(`no order ${order_id}`)
  return view
}
