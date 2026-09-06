import type { Call, CallState } from '@dorado/contracts'
import { Conflict, NotFound } from '#shared/errors.ts'

export function assertCall(row: Call | null | undefined, id: string): asserts row is Call {
  if (!row) throw new NotFound(`no call ${id}`)
}

export function assertEmployee<T>(
  row: T | null | undefined,
  user_id: string
): asserts row is T {
  if (!row) throw new NotFound(`no employee record for user ${user_id}`)
}

// Twilio's own values arrive in call order, not necessarily delivery order.
// 'voicemail' is our own terminal label (set by the recording callback, never
// sent by Twilio) and ranks with the other terminal states.
const RANK: Record<CallState, number> = {
  queued: 0,
  ringing: 1,
  'in-progress': 2,
  completed: 3,
  busy: 3,
  'no-answer': 3,
  failed: 3,
  canceled: 3,
  voicemail: 3,
}

export function statusShouldApply(current: CallState, incoming: CallState): boolean {
  return RANK[incoming] >= RANK[current]
}

export const RING_TIMEOUT_SECONDS = 20

// Postgres does not raise on a zero-row UPDATE, so a WHERE that has quietly
// stopped resolving succeeds forever and the only symptom is a status that
// never moves.
export function assertApplied(changed: unknown, what: string): void {
  if (!changed) throw new Conflict(`${what} changed nothing`)
}
