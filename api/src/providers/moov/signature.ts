import crypto from 'node:crypto'

export const SIGNATURE_HEADER = 'x-signature'
export const TIMESTAMP_HEADER = 'x-timestamp'
export const NONCE_HEADER = 'x-nonce'
export const WEBHOOK_ID_HEADER = 'x-webhook-id'

const TOLERANCE_MS = 5 * 60 * 1000

export function signingString(
  timestamp: string,
  nonce: string,
  webhookID: string,
  body: string
): string {
  return `${timestamp}|${nonce}|${webhookID}|${body}`
}

export function sign(secret: string, payload: string): string {
  return crypto.createHmac('sha512', secret).update(payload).digest('hex')
}

function fresh(timestamp: string, now: number): boolean {
  const at = Number(timestamp)
  if (!Number.isFinite(at)) return false
  return Math.abs(now - at) <= TOLERANCE_MS
}

function equal(a: string, b: string): boolean {
  const left = Buffer.from(a, 'utf8')
  const right = Buffer.from(b, 'utf8')
  if (left.length !== right.length) return false
  return crypto.timingSafeEqual(left, right)
}

export function verifyMoovSignature(
  secret: string,
  body: string,
  signature: string | undefined,
  timestamp: string | undefined,
  nonce: string | undefined,
  webhookID: string | undefined,
  now = Date.now()
): boolean {
  if (!secret || !signature || !timestamp || !nonce || !webhookID) return false
  if (!fresh(timestamp, now)) return false
  return equal(signature, sign(secret, signingString(timestamp, nonce, webhookID, body)))
}
