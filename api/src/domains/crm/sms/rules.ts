import type { SmsDeliveryStatus, SmsMessage } from '@dorado/contracts'
import { Conflict, NotFound } from '#shared/errors.ts'

export function assertMessage(
  row: SmsMessage | null | undefined,
  id: string
): asserts row is SmsMessage {
  if (!row) throw new NotFound(`no sms message ${id}`)
}

// A delivered arriving after a sent wins; a sent arriving after a delivered is
// ignored. Twilio's own callback order is not trustworthy, so arrival order
// is replaced by this rank - equal rank still applies, which is what makes an
// exact replay a harmless no-op instead of a rejection.
const RANK: Record<SmsDeliveryStatus, number> = {
  received: 0,
  queued: 1,
  sent: 2,
  delivered: 3,
  failed: 3,
  undelivered: 3,
}

export function statusShouldApply(current: SmsDeliveryStatus, incoming: SmsDeliveryStatus): boolean {
  return RANK[incoming] >= RANK[current]
}

// Postgres does not raise on a zero-row UPDATE, so a WHERE that has quietly
// stopped resolving succeeds forever and the only symptom is a status that
// never moves.
export function assertApplied(changed: unknown, what: string): void {
  if (!changed) throw new Conflict(`${what} changed nothing`)
}
