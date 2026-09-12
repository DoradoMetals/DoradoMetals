import crypto from 'node:crypto'
import {
  RESEND_ID_HEADER,
  RESEND_TIMESTAMP_HEADER,
  RESEND_SIGNATURE_HEADER,
} from '#providers/resend/constants.ts'

export const ID_HEADER = RESEND_ID_HEADER
export const TIMESTAMP_HEADER = RESEND_TIMESTAMP_HEADER
export const SIGNATURE_HEADER = RESEND_SIGNATURE_HEADER

const TOLERANCE_SECONDS = 5 * 60

export function signingKey(secret: string): Buffer {
  const base = secret.startsWith('whsec_') ? secret.slice('whsec_'.length) : secret
  return Buffer.from(base, 'base64')
}

export function signedContent(id: string, timestamp: string, body: string): string {
  return `${id}.${timestamp}.${body}`
}

export function sign(secret: string, id: string, timestamp: string, body: string): string {
  return crypto
    .createHmac('sha256', signingKey(secret))
    .update(signedContent(id, timestamp, body), 'utf8')
    .digest('base64')
}

export function header(secret: string, id: string, timestamp: string, body: string): string {
  return `v1,${sign(secret, id, timestamp, body)}`
}

function fresh(timestamp: string, nowSeconds: number): boolean {
  const at = Number(timestamp)
  if (!Number.isFinite(at)) return false
  return Math.abs(nowSeconds - at) <= TOLERANCE_SECONDS
}

function equal(a: string, b: string): boolean {
  const left = Buffer.from(a, 'utf8')
  const right = Buffer.from(b, 'utf8')
  if (left.length !== right.length) return false
  return crypto.timingSafeEqual(left, right)
}

export function verify(
  secret: string,
  body: string,
  id: string | undefined,
  timestamp: string | undefined,
  signature: string | undefined,
  now = Date.now()
): boolean {
  if (!secret || !body || !id || !timestamp || !signature) return false
  if (!fresh(timestamp, Math.floor(now / 1000))) return false
  const expected = sign(secret, id, timestamp, body)
  for (const candidate of signature.split(' ')) {
    const [version, value] = candidate.split(',')
    if (version !== 'v1' || !value) continue
    if (equal(value, expected)) return true
  }
  return false
}

export type ResendEventOutcome = 'delivered' | 'bounced' | 'complained'

export type ResendEvent = {
  event_id: string
  type: string
  email_id: string
  occurred_at: string
  bounce_reason: string | null
}

type RawEvent = {
  type?: string
  created_at?: string
  data?: {
    email_id?: string
    created_at?: string
    bounce?: { message?: string; type?: string; subType?: string }
  }
}

export function eventFrom(event_id: string, payload: string): ResendEvent | null {
  let raw: RawEvent
  try {
    raw = JSON.parse(payload) as RawEvent
  } catch {
    return null
  }
  const email_id = raw.data?.email_id
  if (!raw.type || !email_id) return null
  const bounce = raw.data?.bounce
  return {
    event_id,
    type: raw.type,
    email_id,
    occurred_at: raw.created_at ?? raw.data?.created_at ?? new Date().toISOString(),
    bounce_reason: bounce ? (bounce.message ?? bounce.subType ?? bounce.type ?? null) : null,
  }
}
