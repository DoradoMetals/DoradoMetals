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

export const outcomeOf = (delivery: Delivery): EmailOutcome =>
  delivery.sent
    ? { status: 'sent', provider_message_id: messageIdOf(delivery.result) }
    : { status: 'failed', error: delivery.error }

export function assertDelivered(
  delivery: Delivery
): asserts delivery is { sent: true; result: unknown } {
  if (!delivery.sent) throw new Error(delivery.error)
}

export function orderLabel(direction: Direction, number: number): string {
  return direction === 'sale' ? formatSalesOrderNumber(number) : formatPurchaseOrderNumber(number)
}

export function payoutRoute(method: string | null, last_four: string | null): string {
  if (method === 'ACH' || method === 'WIRE') {
    const account = last_four ? ` to the account ending ${last_four}` : ''
    return method === 'WIRE'
      ? `Sent by wire${account} — most banks post it the same business day.`
      : `Sent by ACH${account} — most banks post it within 1–3 business days.`
  }
  return 'Added to your Dorado balance — it is available to spend right away.'
}

export function documentLede(label: string): string {
  return label.toLowerCase() === 'packing list'
    ? 'Print it and put it inside the box with your items. The prepaid label is attached to ' +
        'this email as well.'
    : "It's attached to this email, and you can open it from your order at any time."
}

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

export function deliveryOutcomeOf(type: string): ResendEventOutcome | null {
  if (type === 'email.delivered') return 'delivered'
  if (type === 'email.bounced') return 'bounced'
  if (type === 'email.complained') return 'complained'
  return null
}

export function suppressible(kind: EmailKind): boolean {
  return kind === 'promo'
}
