import { test } from 'vitest'
import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import { keyIdOf, verifyPlaidWebhook } from '#providers/plaid/verify.ts'
import type { PlaidVerificationKey } from '#providers/plaid/types.ts'

const { publicKey, privateKey } = crypto.generateKeyPairSync('ec', { namedCurve: 'P-256' })

const jwk = publicKey.export({ format: 'jwk' }) as { kty: string; crv: string; x: string; y: string }

const KEY: PlaidVerificationKey = {
  kty: jwk.kty,
  crv: jwk.crv,
  x: jwk.x,
  y: jwk.y,
  kid: 'plaid-key-1',
  alg: 'ES256',
  use: 'sig',
}

const b64 = (value: unknown): string =>
  Buffer.from(JSON.stringify(value)).toString('base64url')

function token(body: string, issuedAt: number, kid = 'plaid-key-1'): string {
  const header = b64({ alg: 'ES256', kid, typ: 'JWT' })
  const payload = b64({
    iat: issuedAt,
    request_body_sha256: crypto.createHash('sha256').update(body, 'utf8').digest('hex'),
  })
  const signature = crypto.sign(
    'sha256',
    Buffer.from(`${header}.${payload}`),
    { key: privateKey, dsaEncoding: 'ieee-p1363' }
  )
  return `${header}.${payload}.${signature.toString('base64url')}`
}

const BODY = '{"webhook_type":"TRANSACTIONS","webhook_code":"SYNC_UPDATES_AVAILABLE"}'
const NOW = 1_757_000_000

test('a webhook signed by the named key over this body verifies', () => {
  assert.equal(verifyPlaidWebhook(token(BODY, NOW), KEY, BODY, NOW), true)
})

test('the key id is read out of the header', () => {
  assert.equal(keyIdOf(token(BODY, NOW)), 'plaid-key-1')
})

test('a token whose alg is not ES256 names no key', () => {
  const header = Buffer.from(JSON.stringify({ alg: 'HS256', kid: 'x' })).toString('base64url')
  assert.equal(keyIdOf(`${header}.e30.sig`), null)
})

test('the same token over a different body is refused', () => {
  assert.equal(verifyPlaidWebhook(token(BODY, NOW), KEY, `${BODY} `, NOW), false)
})

test('a token signed by another key is refused', () => {
  const other = crypto.generateKeyPairSync('ec', { namedCurve: 'P-256' })
  const otherJwk = other.publicKey.export({ format: 'jwk' }) as {
    kty: string
    crv: string
    x: string
    y: string
  }
  assert.equal(
    verifyPlaidWebhook(token(BODY, NOW), { ...KEY, x: otherJwk.x, y: otherJwk.y }, BODY, NOW),
    false
  )
})

test('a token older than the tolerance is refused', () => {
  assert.equal(verifyPlaidWebhook(token(BODY, NOW), KEY, BODY, NOW + 3600), false)
})

test('a malformed token is refused rather than raising', () => {
  assert.equal(verifyPlaidWebhook('not-a-jwt', KEY, BODY, NOW), false)
})
