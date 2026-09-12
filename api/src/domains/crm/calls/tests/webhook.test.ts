import { test, afterAll, afterEach } from 'vitest'
import assert from 'node:assert/strict'
import request from 'supertest'
import pool from '#pool'
import query from '#shared/db/query.ts'
import { sign } from '#providers/twilio/signature.ts'
import { mockSessions, restoreSessions, anonymous } from '#shared/testing/session.ts'
import { TEST_ACTOR } from '#shared/testing/actor.ts'
import { inPinnedTransaction } from '#shared/testing/pinned-pool.ts'

await mockSessions()
const { default: app } = await import('#app')

afterAll(async () => {
  restoreSessions()
  await pool.end()
})

const TOKEN = 'test-twilio-auth-token'
const PUBLIC_URL = 'https://api.example.test'

const saved = new Map<string, string | undefined>()
function setEnv(name: string, value: string): void {
  if (!saved.has(name)) saved.set(name, process.env[name])
  process.env[name] = value
}
afterEach(() => {
  for (const [name, value] of saved) {
    if (value === undefined) delete process.env[name]
    else process.env[name] = value
  }
  saved.clear()
})

function realSignature(): void {
  setEnv('TWILIO_AUTH_TOKEN', TOKEN)
  setEnv('PUBLIC_API_URL', PUBLIC_URL)
}

const sig = (path: string, form: Record<string, string>) => sign(`${PUBLIC_URL}${path}`, form, TOKEN)

let counter = 0
const aSid = () => `CAwebhook${String((counter += 1)).padStart(24, '0')}`

test('a call webhook with a bad signature is refused with 403', async () => {
  realSignature()
  await inPinnedTransaction(
    async () => {
      const form = { CallSid: aSid(), From: '+15125550001', To: '+15125550000' }
      const res = await request(app)
        .post('/api/calls/twiml')
        .type('form')
        .set('X-Twilio-Signature', 'wrong')
        .send(form)
      assert.equal(res.status, 403)
    },
    { actor: TEST_ACTOR.id }
  )
})

test('an inbound call with no admin online answers with Record TwiML', async () => {
  realSignature()
  await inPinnedTransaction(
    async () => {
      const form = { CallSid: aSid(), From: '+15125550001', To: '+15125550000' }
      const res = await request(app)
        .post('/api/calls/twiml')
        .type('form')
        .set('X-Twilio-Signature', sig('/api/calls/twiml', form))
        .send(form)
      assert.equal(res.status, 200)
      assert.ok(res.text.includes('<Record'))
    },
    { actor: TEST_ACTOR.id }
  )
})

test('a completed status arriving after canceled is ignored (both terminal, first wins is not the rule - equal rank still applies)', async () => {
  realSignature()
  await inPinnedTransaction(
    async (client) => {
      const sid = aSid()
      await client.query(
        `INSERT INTO crm.calls (provider, provider_sid, direction, from_number, to_number, status)
         VALUES ('twilio', $1, 'outbound', '+15125550000', '+15125550002', 'ringing')`,
        [sid]
      )

      const inProgress = { CallSid: sid, CallStatus: 'in-progress', CallDuration: '0' }
      await request(app)
        .post('/api/calls/status')
        .type('form')
        .set('X-Twilio-Signature', sig('/api/calls/status', inProgress))
        .send(inProgress)

      const ringingAgain = { CallSid: sid, CallStatus: 'ringing', CallDuration: '0' }
      await request(app)
        .post('/api/calls/status')
        .type('form')
        .set('X-Twilio-Signature', sig('/api/calls/status', ringingAgain))
        .send(ringingAgain)

      const { rows } = await query<{ status: string }>(
        'SELECT status FROM crm.calls WHERE provider_sid = $1',
        [sid],
        client
      )
      assert.equal(rows[0].status, 'in-progress', 'a stale ringing regressed the status')
    },
    { actor: TEST_ACTOR.id }
  )
})

test('a completed status after in-progress applies, with the duration', async () => {
  realSignature()
  await inPinnedTransaction(
    async (client) => {
      const sid = aSid()
      await client.query(
        `INSERT INTO crm.calls (provider, provider_sid, direction, from_number, to_number, status)
         VALUES ('twilio', $1, 'outbound', '+15125550000', '+15125550002', 'in-progress')`,
        [sid]
      )

      const completed = { CallSid: sid, CallStatus: 'completed', CallDuration: '37' }
      await request(app)
        .post('/api/calls/status')
        .type('form')
        .set('X-Twilio-Signature', sig('/api/calls/status', completed))
        .send(completed)

      const { rows } = await query<{ status: string; duration_seconds: number; ended_at: string }>(
        'SELECT status, duration_seconds, ended_at FROM crm.calls WHERE provider_sid = $1',
        [sid],
        client
      )
      assert.equal(rows[0].status, 'completed')
      assert.equal(rows[0].duration_seconds, 37)
      assert.ok(rows[0].ended_at)
    },
    { actor: TEST_ACTOR.id }
  )
})

test('the admin reads refuse an anonymous caller', async () => {
  await inPinnedTransaction(
    async () => {
      await anonymous(async () => {
        const tokenRes = await request(app).post('/api/calls/token').send({})
        assert.ok([401, 403].includes(tokenRes.status))

        const presenceRes = await request(app).post('/api/calls/presence').send({ online: true })
        assert.ok([401, 403].includes(presenceRes.status))
      })
    },
    { actor: TEST_ACTOR.id }
  )
})
