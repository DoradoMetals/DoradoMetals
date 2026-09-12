import type { Delivery, ResendEventOutcome } from '#providers/resend/index.ts'
import type { EmailOutcome } from '#documents/emails/record.ts'
import type { Direction, EmailKind, MailerRow } from '@dorado/contracts'
import { maskEmail, maskPhone } from '#shared/text/mask.ts'
import {
  formatPurchaseOrderNumber,
  formatSalesOrderNumber,
} from '#shared/utils/formatOrderNumbers.ts'

const messageIdOf = (result: unknown): string | null => {
  const id = (result as { messageId?: unknown } | null | undefined)?.messageId
  return typeof id === 'string' ? id : null
}

// What the paper trail records about one send. A failure is a row too: the
// type has always described one and nothing ever built it (LD F17).
export const outcomeOf = (delivery: Delivery): EmailOutcome =>
  delivery.sent
    ? { status: 'sent', provider_message_id: messageIdOf(delivery.result) }
    : { status: 'failed', error: delivery.error }

// The send failed after its row was filed. The message the provider gave is
// what travels on, unchanged, so the caller sees what it always saw.
export function assertDelivered(
  delivery: Delivery
): asserts delivery is { sent: true; result: unknown } {
  if (!delivery.sent) throw new Error(delivery.error)
}

// How an order is NAMED to its customer. Purchase and sale number separately
// and always have; the mailers print the same string the invoices do.
export function orderLabel(direction: Direction, number: number): string {
  return direction === 'sale' ? formatSalesOrderNumber(number) : formatPurchaseOrderNumber(number)
}

// The payout sentence. A bank payout names the rail and the LAST FOUR - never
// more of the account than that - and a balance credit names neither, because
// there is no bank in it.
export function payoutRoute(method: string | null, last_four: string | null): string {
  if (method === 'ACH' || method === 'WIRE') {
    const account = last_four ? ` to the account ending ${last_four}` : ''
    return method === 'WIRE'
      ? `Sent by wire${account} — most banks post it the same business day.`
      : `Sent by ACH${account} — most banks post it within 1–3 business days.`
  }
  return 'Added to your Dorado balance — it is available to spend right away.'
}

// A packing list has an instruction attached to it; every other document is
// simply a document.
export function documentLede(label: string): string {
  return label.toLowerCase() === 'packing list'
    ? 'Print it and put it inside the box with your items. The prepaid label is attached to ' +
        'this email as well.'
    : "It's attached to this email, and you can open it from your order at any time."
}

// The Details changed card's rows, with both values MASKED - an email becomes
// j•••@domain and a phone number (•••) •••-0134. A mailer is read in inboxes
// that are not always the account's own, and the point of the row is to confirm
// WHICH detail changed, not to republish it.
export function detailsChangedRows(
  changed: string,
  previous: string | null,
  next: string | null
): MailerRow[] {
  const mask = changed.toLowerCase().includes('phone') ? maskPhone : maskEmail
  const rows: MailerRow[] = [{ label: 'What changed', value: changed }]
  if (previous) rows.push({ label: 'Previous', value: mask(previous) })
  if (next) rows.push({ label: 'New', value: mask(next) })
  return rows
}

// Which of Resend's events the trail has a column for. A delivery_delayed or an
// open is accepted and recorded nowhere: there is no column, and refusing it
// would make Resend retry a delivery we are happy with.
export function deliveryOutcomeOf(type: string): ResendEventOutcome | null {
  if (type === 'email.delivered') return 'delivered'
  if (type === 'email.bounced') return 'bounced'
  if (type === 'email.complained') return 'complained'
  return null
}

// Marketing only. A code and an order mailer keep going to a bounced address:
// the customer is waiting on both, and a bounced code is a sign-in failure they
// can see and report.
export function suppressible(kind: EmailKind): boolean {
  return kind === 'promo'
}
