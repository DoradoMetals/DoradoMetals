import { test, afterAll } from 'vitest'
import assert from 'node:assert/strict'
import type { PoolClient } from 'pg'
import request from 'supertest'
import pool from '#pool'
import { mockSessions, restoreSessions, as, asAdmin } from '#shared/testing/session.ts'
import { TEST_ACTOR } from '#shared/testing/actor.ts'
import { inPinnedTransaction } from '#shared/testing/pinned-pool.ts'
import { LOCKS } from '#shared/testing/locks.ts'
import { aUser, aTag, aLead } from '#shared/testing/builders/index.ts'

await mockSessions()
const { default: app } = await import('#app')

afterAll(async () => {
  restoreSessions()
  await pool.end()
})

const inCrm = <T>(fn: (c: PoolClient) => Promise<T>) =>
  inPinnedTransaction(fn, { actor: TEST_ACTOR.id, lock: LOCKS.USERS })

test('the composer sends to the number on file, and carries its attachments', async () => {
  await inCrm(async (c) => {
    const customer = await aUser(c, { phone_number: `+1512555${aTag().slice(-4)}` })
    await asAdmin(TEST_ACTOR, async () => {
      const res = await request(app)
        .post('/api/sms')
        .send({
          user_id: customer.id,
          body: 'your parcel is on its way',
          media: [{ url: 'https://example.invalid/label.png', content_type: 'image/png' }],
        })
      assert.equal(res.status, 201, res.text)
      assert.equal(res.body.direction, 'outbound')
      assert.equal(res.body.body, 'your parcel is on its way')
      assert.equal(res.body.media.length, 1)
      assert.equal(res.body.media[0].content_type, 'image/png')
    })
  })
})

test('a customer with no number on file is refused rather than texted into space', async () => {
  await inCrm(async (c) => {
    const customer = await aUser(c)
    await asAdmin(TEST_ACTOR, async () => {
      const res = await request(app).post('/api/sms').send({ user_id: customer.id, body: 'hello' })
      assert.equal(res.status, 422, res.text)
    })
  })
})

test('ruling 112: a customer with no sms consent is still texted, not refused', async () => {
  await inCrm(async (c) => {
    const customer = await aUser(c, { phone_number: `+1512555${aTag().slice(-4)}` })
    await asAdmin(TEST_ACTOR, async () => {
      const res = await request(app)
        .post('/api/sms')
        .send({ user_id: customer.id, body: 'hello' })
      assert.equal(res.status, 201, res.text)
    })
  })
})

test('a lead can be texted by lead_id whether or not it has consented', async () => {
  await inCrm(async (c) => {
    const consenting = await aLead(c, { phone: `+1512555${aTag().slice(-4)}` })
    await c.query(
      'UPDATE leads.leads SET sms_consent_at = now(), sms_consent_method = $2 WHERE id = $1',
      [consenting.id, 'verbal']
    )
    const unconsenting = await aLead(c, { phone: `+1512555${aTag().slice(-4)}` })

    await asAdmin(TEST_ACTOR, async () => {
      const sent = await request(app)
        .post('/api/sms')
        .send({ lead_id: consenting.id, body: 'following up on your quote' })
      assert.equal(sent.status, 201, sent.text)
      assert.equal(sent.body.to_number, consenting.phone)

      const alsoSent = await request(app)
        .post('/api/sms')
        .send({ lead_id: unconsenting.id, body: 'following up on your quote' })
      assert.equal(alsoSent.status, 201, alsoSent.text)
    })
  })
})

test('POST /api/sms/consent_request sends the opt-in text and records it', async () => {
  await inCrm(async (c) => {
    const customer = await aUser(c, { phone_number: `+1512555${aTag().slice(-4)}` })
    await asAdmin(TEST_ACTOR, async () => {
      const res = await request(app)
        .post('/api/sms/consent_request')
        .send({ user_id: customer.id })
      assert.equal(res.status, 201, res.text)
      assert.equal(res.body.direction, 'outbound')
      assert.match(res.body.body, /Reply YES/)
      assert.match(res.body.body, /Reply STOP to opt out, HELP for help/)
    })
  })
})

test('POST /api/sms/consent_request works for a lead by lead_id too', async () => {
  await inCrm(async (c) => {
    const lead = await aLead(c, { phone: `+1512555${aTag().slice(-4)}` })
    await asAdmin(TEST_ACTOR, async () => {
      const res = await request(app).post('/api/sms/consent_request').send({ lead_id: lead.id })
      assert.equal(res.status, 201, res.text)
      assert.equal(res.body.to_number, lead.phone)
    })
  })
})

test('POST /api/sms/consent_request needs exactly one of user_id or lead_id', async () => {
  await inCrm(async () => {
    await asAdmin(TEST_ACTOR, async () => {
      const neither = await request(app).post('/api/sms/consent_request').send({})
      assert.equal(neither.status, 400, neither.text)
    })
  })
})

test('the composer needs exactly one of user_id or lead_id', async () => {
  await inCrm(async () => {
    await asAdmin(TEST_ACTOR, async () => {
      const neither = await request(app).post('/api/sms').send({ body: 'hi' })
      assert.equal(neither.status, 400, neither.text)
    })
  })
})

test('the composer is admin-only and its body is strict', async () => {
  await inCrm(async (c) => {
    const customer = await aUser(c, { phone_number: `+1512555${aTag().slice(-4)}` })
    await as({ ...customer, role: 'user' }, async () => {
      const res = await request(app).post('/api/sms').send({ user_id: customer.id, body: 'hi' })
      assert.equal(res.status, 403, res.text)
    })
    await asAdmin(TEST_ACTOR, async () => {
      const res = await request(app)
        .post('/api/sms')
        .send({ user_id: customer.id, body: 'hi', to_number: '+15125550000' })
      assert.equal(res.status, 400, res.text)
    })
  })
})

test('the timeline names each call as one of the four kinds the design draws', async () => {
  await inCrm(async (c) => {
    const customer = await aUser(c, { phone_number: `+1512555${aTag().slice(-4)}` })
    const calls: [string, string, string][] = [
      ['outbound', 'completed', 'Outgoing'],
      ['outbound', 'no-answer', 'No answer'],
      ['inbound', 'completed', 'Incoming'],
      ['inbound', 'voicemail', 'Missed'],
    ]
    for (const [direction, status] of calls) {
      await c.query(
        `INSERT INTO crm.calls (provider_sid, direction, from_number, to_number, status,
                                user_id, started_at)
         VALUES ($1, $2::crm.call_direction, '+15125550000', '+15125550001',
                 $3::crm.call_status, $4, now())`,
        [`CA${aTag()}${direction}${status}`, direction, status, customer.id]
      )
    }

    await asAdmin(TEST_ACTOR, async () => {
      const res = await request(app).get(`/api/customers/${customer.id}/timeline`)
      assert.equal(res.status, 200, res.text)
      const kinds = res.body
        .filter((row: { kind: string }) => row.kind === 'call')
        .map((row: { call_kind: string }) => row.call_kind)
      assert.deepEqual(new Set(kinds), new Set(calls.map(([, , kind]) => kind)))
      for (const row of res.body.filter((r: { kind: string }) => r.kind !== 'call')) {
        assert.equal(row.call_kind, null, 'a message was labelled as a call')
      }
    })
  })
})
