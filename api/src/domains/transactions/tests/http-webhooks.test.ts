import { test, afterAll } from 'vitest'
import assert from 'node:assert/strict'
import request from 'supertest'
import pool from '#pool'
import { sign, signingString } from '#providers/moov/signature.ts'

process.env.MOOV_WEBHOOK_SECRET = 'whsec_moov_http_test'
const { default: app } = await import('#app')

afterAll(async () => {
  await pool.end()
})

const BODY = JSON.stringify({
  eventID: 'evt_http_1',
  type: 'transfer.updated',
  createdOn: '2026-09-06T00:00:00.000Z',
  data: { transferID: 'xfer_unknown', status: 'completed' },
})

const NONCE = 'nonce-http'
const HOOK = 'hook-http'

const signatureFor = (body: string, timestamp: string): string =>
  sign(
    process.env.MOOV_WEBHOOK_SECRET as string,
    signingString(timestamp, NONCE, HOOK, body)
  )

const signed = (body: string, signature?: string) => {
  const timestamp = String(Date.now())
  return request(app)
    .post('/api/webhooks/moov')
    .set('Content-Type', 'application/json')
    .set('x-signature', signature ?? signatureFor(body, timestamp))
    .set('x-timestamp', timestamp)
    .set('x-nonce', NONCE)
    .set('x-webhook-id', HOOK)
    .send(body)
}

test('an unsigned Moov delivery is refused', async () => {
  const res = await request(app)
    .post('/api/webhooks/moov')
    .set('Content-Type', 'application/json')
    .send(BODY)
  assert.equal(res.status, 401)
})

test('a Moov delivery signed with the wrong secret is refused', async () => {
  const res = await signed(BODY, sign('whsec_not_ours', 'anything'))
  assert.equal(res.status, 401)
})

test('a correctly signed Moov delivery is accepted even when it names no transfer of ours', async () => {
  const res = await signed(BODY)
  assert.equal(res.status, 200)
  assert.deepEqual(res.body, { received: true })
})

test('an unsigned Plaid delivery is refused', async () => {
  const res = await request(app)
    .post('/api/webhooks/plaid')
    .set('Content-Type', 'application/json')
    .send(JSON.stringify({ webhook_type: 'TRANSACTIONS' }))
  assert.equal(res.status, 401)
})

test('a Plaid delivery with a token that names no key is refused', async () => {
  const res = await request(app)
    .post('/api/webhooks/plaid')
    .set('Content-Type', 'application/json')
    .set('plaid-verification', 'not-a-jwt')
    .send(JSON.stringify({ webhook_type: 'TRANSACTIONS' }))
  assert.equal(res.status, 401)
})
