import type { SmsDeliveryStatus, SmsMessage } from '@dorado/contracts'
import { Conflict, Invalid, NotFound } from '#shared/errors.ts'

export function assertMessage(
  row: SmsMessage | null | undefined,
  id: string
): asserts row is SmsMessage {
  if (!row) throw new NotFound(`no sms message ${id}`)
}

export function assertTextable(phone_number: string | null, user_id: string): void {
  if (!phone_number) {
    throw new Invalid(`customer ${user_id} has no phone number on file, so nothing can be sent`)
  }
}

const RANK: Record<SmsDeliveryStatus, number> = {
  received: 0,
  queued: 1,
  sent: 2,
  delivered: 3,
  failed: 3,
  undelivered: 3,
}

export function statusShouldApply(
  current: SmsDeliveryStatus,
  incoming: SmsDeliveryStatus
): boolean {
  return RANK[incoming] >= RANK[current]
}

export function assertApplied(changed: unknown, what: string): void {
  if (!changed) throw new Conflict(`${what} changed nothing`)
}
