import type { Delivery } from '#providers/emails/nodemailer.ts'
import type { EmailOutcome } from '#documents/emails/record.ts'

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
