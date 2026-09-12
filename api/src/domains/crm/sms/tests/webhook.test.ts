import { test, afterAll, afterEach } from 'vitest'
import assert from 'node:assert/strict'
import request from 'supertest'
import pool from '#pool'
import query from '#shared/db/query.ts'
import { sign } from '#providers/twilio/signature.ts'
import { mockSessions, restoreSessions } from '#shared/testing/session.ts'
import { TEST_ACTOR } from '#shared/testing/actor.ts'
import { LOCKS } from '#shared/testing/locks.ts'
import { inPinnedTransaction } from '#shared/testing/pinned-pool.ts'
import { aUser } from '#shared/testing/builders/index.ts'

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
  setEnv('SMS_PROVIDER', 'twilio')
  setEnv('TWILIO_AUTH_TOKEN', TOKEN)
  setEnv('PUBLIC_API_URL', PUBLIC_URL)
}

let counter = 0
function aSid(): string {
  counter += 1
  return `SMtest${String(counter).padStart(28, '0')}`
}

function inboundForm(over: Record<string, string> = {}): Record<string, string> {
  return {
    MessageSid: aSid(),
    From: '+15125550001',
    To: '+15125550000',
    Body: 'hello from the customer',
    NumMedia: '0',
    ...over,
  }
}

const sig = (path: string, form: Record<string, string>) => sign(`${PUBLIC_URL}${path}`, form, TOKEN)

test('a bad signature is refused with 403 and writes no row', async () => {
  realSignature()
  await inPinnedTransaction(
    async (client) => {
      const form = inboundForm()
      const res = await request(app)
        .post('/api/sms/inbound')
        .type('form')
        .set('X-Twilio-Signature', 'not-the-real-signature')
        .send(form)
      assert.equal(res.status, 403)

      const { rows } = await query<{ n: number }>(
        'SELECT count(*)::int AS n FROM crm.sms_messages WHERE provider_sid = $1',
        [form.MessageSid],
        client
      )
      assert.equal(rows[0].n, 0, 'a refused webhook wrote a row anyway')
    },
    { actor: TEST_ACTOR.id }
  )
})

test('a missing signature is refused the same way', async () => {
  realSignature()
  await inPinnedTransaction(
    async () => {
      const res = await request(app).post('/api/sms/inbound').type('form').send(inboundForm())
      assert.equal(res.status, 403)
    },
    { actor: TEST_ACTOR.id }
  )
})

test('a replayed inbound webhook is idempotent - one row for one provider_sid', async () => {
  realSignature()
  await inPinnedTransaction(
    async (client) => {
      const form = inboundForm()
      const header = sig('/api/sms/inbound', form)

      for (let i = 0; i < 2; i += 1) {
        const res = await request(app)
          .post('/api/sms/inbound')
          .type('form')
          .set('X-Twilio-Signature', header)
          .send(form)
        assert.equal(res.status, 200, `attempt ${i} did not succeed`)
      }

      const { rows } = await query<{ n: number }>(
        'SELECT count(*)::int AS n FROM crm.sms_messages WHERE provider_sid = $1',
        [form.MessageSid],
        client
      )
      assert.equal(rows[0].n, 1, 'a replayed webhook wrote a second row')
    },
    { actor: TEST_ACTOR.id }
  )
})

test('user_id is matched by a verified phone and not by an unverified one', async () => {
  realSignature()
  await inPinnedTransaction(
    async (client) => {
      const verified = await aUser(client, { phone_number: '+15125559001' })
      await client.query('UPDATE auth.users SET phone_number_verified = true WHERE id = $1', [
        verified.id,
      ])
      const unverified = await aUser(client, { phone_number: '+15125559002' })

      const verifiedForm = inboundForm({ From: '+15125559001' })
      await request(app)
        .post('/api/sms/inbound')
        .type('form')
        .set('X-Twilio-Signature', sig('/api/sms/inbound', verifiedForm))
        .send(verifiedForm)

      const unverifiedForm = inboundForm({ From: '+15125559002' })
      await request(app)
        .post('/api/sms/inbound')
        .type('form')
        .set('X-Twilio-Signature', sig('/api/sms/inbound', unverifiedForm))
        .send(unverifiedForm)

      const { rows } = await query<{ from_number: string; user_id: string | null }>(
        `SELECT from_number, user_id FROM crm.sms_messages
          WHERE provider_sid = $1 OR provider_sid = $2`,
        [verifiedForm.MessageSid, unverifiedForm.MessageSid],
        client
      )
      const matched = rows.find((r) => r.from_number === '+15125559001')
      const notMatched = rows.find((r) => r.from_number === '+15125559002')
      assert.equal(matched?.user_id, verified.id, 'the verified phone was not matched')
      assert.equal(notMatched?.user_id, null, 'the unverified phone was matched anyway')
    },
    { lock: LOCKS.USERS, actor: TEST_ACTOR.id }
  )
})

test('a two-media inbound message round-trips both attachments', async () => {
  realSignature()
  await inPinnedTransaction(
    async (client) => {
      const form = inboundForm({
        NumMedia: '2',
        MediaUrl0: 'https://api.twilio.com/media/one.jpg',
        MediaContentType0: 'image/jpeg',
        MediaUrl1: 'https://api.twilio.com/media/two.png',
        MediaContentType1: 'image/png',
      })
      const res = await request(app)
        .post('/api/sms/inbound')
        .type('form')
        .set('X-Twilio-Signature', sig('/api/sms/inbound', form))
        .send(form)
      assert.equal(res.status, 200)

      const { rows } = await query<{ media: { url: string; content_type: string }[] }>(
        'SELECT media FROM crm.sms_messages WHERE provider_sid = $1',
        [form.MessageSid],
        client
      )
      assert.equal(rows[0].media.length, 2)
      assert.equal(rows[0].media[0].url, 'https://api.twilio.com/media/one.jpg')
      assert.equal(rows[0].media[0].content_type, 'image/jpeg')
      assert.equal(rows[0].media[1].content_type, 'image/png')
    },
    { actor: TEST_ACTOR.id }
  )
})

test('a delivered status arriving after sent wins', async () => {
  realSignature()
  await inPinnedTransaction(
    async (client) => {
      const sid = aSid()
      await client.query(
        `INSERT INTO crm.sms_messages (direction, provider, provider_sid, from_number, to_number, status)
         VALUES ('outbound', 'twilio', $1, '+15125550000', '+15125550099', 'queued')`,
        [sid]
      )

      const sentForm = { MessageSid: sid, MessageStatus: 'sent' }
      await request(app)
        .post('/api/sms/status')
        .type('form')
        .set('X-Twilio-Signature', sig('/api/sms/status', sentForm))
        .send(sentForm)

      const deliveredForm = { MessageSid: sid, MessageStatus: 'delivered' }
      await request(app)
        .post('/api/sms/status')
        .type('form')
        .set('X-Twilio-Signature', sig('/api/sms/status', deliveredForm))
        .send(deliveredForm)

      const { rows } = await query<{ status: string }>(
        'SELECT status FROM crm.sms_messages WHERE provider_sid = $1',
        [sid],
        client
      )
      assert.equal(rows[0].status, 'delivered')
    },
    { actor: TEST_ACTOR.id }
  )
})

test('a sent status arriving after delivered is ignored', async () => {
  realSignature()
  await inPinnedTransaction(
    async (client) => {
      const sid = aSid()
      await client.query(
        `INSERT INTO crm.sms_messages (direction, provider, provider_sid, from_number, to_number, status)
         VALUES ('outbound', 'twilio', $1, '+15125550000', '+15125550099', 'queued')`,
        [sid]
      )

      const deliveredForm = { MessageSid: sid, MessageStatus: 'delivered' }
      await request(app)
        .post('/api/sms/status')
        .type('form')
        .set('X-Twilio-Signature', sig('/api/sms/status', deliveredForm))
        .send(deliveredForm)

      const sentForm = { MessageSid: sid, MessageStatus: 'sent' }
      await request(app)
        .post('/api/sms/status')
        .type('form')
        .set('X-Twilio-Signature', sig('/api/sms/status', sentForm))
        .send(sentForm)

      const { rows } = await query<{ status: string }>(
        'SELECT status FROM crm.sms_messages WHERE provider_sid = $1',
        [sid],
        client
      )
      assert.equal(rows[0].status, 'delivered', 'a stale "sent" callback overwrote "delivered"')
    },
    { actor: TEST_ACTOR.id }
  )
})
