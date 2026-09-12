import { test, afterAll } from 'vitest'
import assert from 'node:assert/strict'
import request from 'supertest'
import pool from '#pool'
import { header, sign } from '#providers/communications/email/resend-webhook.ts'

process.env.RESEND_WEBHOOK_SECRET = 'whsec_cmVzZW5kLWh0dHAtdGVzdC1zZWNyZXQ='
const { default: app } = await import('#app')

afterAll(async () => {
  await pool.end()
})

const ID = 'msg_http_1'
const BODY = JSON.stringify({
  type: 'email.delivered',
  created_at: '2026-09-11T00:00:00.000Z',
  data: { email_id: '00000000-0000-4000-8000-00000000dead' },
})

const post = (body: string, headers: Record<string, string>) => {
  let req = request(app).post('/api/webhooks/resend').set('Content-Type', 'application/json')
  for (const [name, value] of Object.entries(headers)) req = req.set(name, value)
  return req.send(body)
}

const signedHeaders = (body: string, id = ID) => {
  const timestamp = String(Math.floor(Date.now() / 1000))
  return {
    'svix-id': id,
    'svix-timestamp': timestamp,
    'svix-signature': header(process.env.RESEND_WEBHOOK_SECRET as string, id, timestamp, body),
  }
}

test('an unsigned Resend delivery is refused', async () => {
  const res = await post(BODY, {})
  assert.equal(res.status, 401)
})

test('a delivery signed with another secret is refused', async () => {
  const timestamp = String(Math.floor(Date.now() / 1000))
  const res = await post(BODY, {
    'svix-id': ID,
    'svix-timestamp': timestamp,
    'svix-signature': `v1,${sign('whsec_bm90LW91cnMtbm90LW91cnMtbm9wZQ==', ID, timestamp, BODY)}`,
  })
  assert.equal(res.status, 401)
})

test('a signed delivery whose body was changed in flight is refused', async () => {
  const headers = signedHeaders(BODY)
  const res = await post(BODY.replace('delivered', 'bounced'), headers)
  assert.equal(res.status, 401)
})

test('a stale delivery is refused', async () => {
  const timestamp = String(Math.floor(Date.now() / 1000) - 3600)
  const res = await post(BODY, {
    'svix-id': ID,
    'svix-timestamp': timestamp,
    'svix-signature': header(process.env.RESEND_WEBHOOK_SECRET as string, ID, timestamp, BODY),
  })
  assert.equal(res.status, 401)
})

test('a correctly signed delivery is accepted even when it names no message of ours', async () => {
  const res = await post(BODY, signedHeaders(BODY))
  assert.equal(res.status, 200)
  assert.deepEqual(res.body, { received: true })
})

test('a signed event we have no column for is accepted rather than retried forever', async () => {
  const body = JSON.stringify({
    type: 'email.opened',
    created_at: '2026-09-11T00:00:00.000Z',
    data: { email_id: '00000000-0000-4000-8000-00000000beef' },
  })
  const res = await post(body, signedHeaders(body, 'msg_http_2'))
  assert.equal(res.status, 200)
  assert.deepEqual(res.body, { received: true })
})
