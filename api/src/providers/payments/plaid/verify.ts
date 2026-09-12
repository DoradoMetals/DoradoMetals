import crypto from 'node:crypto'
import type { PlaidVerificationKey } from '#providers/payments/plaid/types.ts'

// Plaid signs a webhook with a JWT in the `plaid-verification` header: ES256
// over the usual `<header>.<payload>`, with the body's SHA-256 as a claim. So
// verifying is three questions - is the token signed by the key Plaid names,
// is it recent, and is this body the body it was signed over.
export const VERIFICATION_HEADER = 'plaid-verification'

const TOLERANCE_SECONDS = 5 * 60

function decode(part: string): Record<string, unknown> | null {
  try {
    const parsed: unknown = JSON.parse(Buffer.from(part, 'base64url').toString('utf8'))
    return parsed && typeof parsed === 'object' ? (parsed as Record<string, unknown>) : null
  } catch {
    return null
  }
}

export function keyIdOf(token: string): string | null {
  const [header] = token.split('.')
  if (!header) return null
  const parsed = decode(header)
  if (!parsed) return null
  const alg = parsed.alg
  const kid = parsed.kid
  if (alg !== 'ES256' || typeof kid !== 'string') return null
  return kid
}

function publicKeyOf(key: PlaidVerificationKey): crypto.KeyObject {
  return crypto.createPublicKey({
    key: { kty: key.kty, crv: key.crv, x: key.x, y: key.y },
    format: 'jwk',
  })
}

export function verifyPlaidWebhook(
  token: string,
  key: PlaidVerificationKey,
  body: string,
  now = Math.floor(Date.now() / 1000)
): boolean {
  const [header, payload, signature] = token.split('.')
  if (!header || !payload || !signature) return false

  const signed = crypto.verify(
    'sha256',
    Buffer.from(`${header}.${payload}`),
    { key: publicKeyOf(key), dsaEncoding: 'ieee-p1363' },
    Buffer.from(signature, 'base64url')
  )
  if (!signed) return false

  const claims = decode(payload)
  if (!claims) return false
  const issued = claims.iat
  if (typeof issued !== 'number' || now - issued > TOLERANCE_SECONDS) return false

  const expected = claims.request_body_sha256
  if (typeof expected !== 'string') return false
  const actual = crypto.createHash('sha256').update(body, 'utf8').digest('hex')
  if (expected.length !== actual.length) return false
  return crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(actual))
}
