import * as live from '#providers/payments/moov/live.ts'
import * as fake from '#providers/payments/moov/fake.ts'
import type { MoovEvent, MoovRails } from '#providers/payments/moov/types.ts'
import {
  NONCE_HEADER,
  SIGNATURE_HEADER,
  TIMESTAMP_HEADER,
  WEBHOOK_ID_HEADER,
  verifyMoovSignature,
} from '#providers/payments/moov/signature.ts'

// No keys, no live client. The app boots on the recording fake and every call
// is answered in memory, which is what lets the suite - and later the e2e
// harness - drive a transfer through its states with nothing configured.
export const configured = (): boolean => Boolean(process.env.MOOV_SECRET_KEY)

export const rails = (): MoovRails => (configured() ? live.rails : fake.rails)

type RawEvent = {
  eventID?: string
  type?: string
  data?: { transferID?: string; status?: string; failureReason?: string }
  createdOn?: string
}

export function eventFrom(payload: string): MoovEvent | null {
  const raw = JSON.parse(payload) as RawEvent
  if (!raw.eventID || !raw.type) return null
  return {
    eventID: raw.eventID,
    type: raw.type,
    transferID: raw.data?.transferID ?? null,
    status: raw.data?.status ?? null,
    failureReason: raw.data?.failureReason ?? null,
    occurredAt: raw.createdOn ?? new Date().toISOString(),
  }
}

export function verify(
  body: string,
  signature: string | undefined,
  timestamp: string | undefined,
  nonce: string | undefined,
  webhookID: string | undefined
): boolean {
  return verifyMoovSignature(
    process.env.MOOV_WEBHOOK_SECRET ?? '',
    body,
    signature,
    timestamp,
    nonce,
    webhookID
  )
}

export { NONCE_HEADER, SIGNATURE_HEADER, TIMESTAMP_HEADER, WEBHOOK_ID_HEADER }
