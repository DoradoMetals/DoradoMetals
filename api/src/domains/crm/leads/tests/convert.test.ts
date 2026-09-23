import { test, afterAll } from 'vitest'
import assert from 'node:assert/strict'
import request from 'supertest'
import pool from '#pool'
import { mockSessions, restoreSessions, asAdmin, asUser, anonymous } from '#shared/testing/session.ts'
import { TEST_ACTOR } from '#shared/testing/actor.ts'
import { LOCKS } from '#shared/testing/locks.ts'
import { inPinnedTransaction } from '#shared/testing/pinned-pool.ts'
import { aLead, aTag } from '#shared/testing/builders/index.ts'
import * as smsRepo from '#db/crm/sms-messages/repo.ts'
import query from '#shared/db/query.ts'

await mockSessions()
const { default: app } = await import('#app')

afterAll(async () => {
  restoreSessions()
  await pool.end()
})

test('converting a lead creates a customer, marks it converted, and refuses a repeat', async () => {
  await inPinnedTransaction(
    async (client) => {
      const tag = aTag()
      const lead = await aLead(client, {
        name: `Convert Fixture ${tag}`,
        phone: '5125550099',
        email: `${tag}@dorado.test`,
      })

      const res = await asAdmin(TEST_ACTOR, () =>
        request(app).post(`/api/leads/${lead.id}/convert`).send({})
      )
      assert.equal(res.status, 201, JSON.stringify(res.body))
      assert.equal(res.body.email, lead.email)
      assert.equal(res.body.name, lead.name)

      const { rows } = await client.query('SELECT converted FROM leads.leads WHERE id = $1', [
        lead.id,
      ])
      assert.equal(rows[0]?.converted, true, 'the lead was not marked converted')

      const again = await asAdmin(TEST_ACTOR, () =>
        request(app).post(`/api/leads/${lead.id}/convert`).send({})
      )
      assert.equal(again.status, 409, 'converting an already-converted lead should conflict')
    },
    { lock: LOCKS.USERS, actor: TEST_ACTOR.id }
  )
})

test('converting keeps the lead phone number timeline attached to the new customer', async () => {
  await inPinnedTransaction(
    async (client) => {
      const tag = aTag()
      const phone = '5125550098'
      const lead = await aLead(client, {
        name: `Timeline Fixture ${tag}`,
        phone,
        email: `${tag}@dorado.test`,
      })

      const message = await smsRepo.upsertInbound(
        { provider_sid: `SMconv${tag}`, from_number: `+1${phone}`, to_number: '+15125550000', body: 'hi', media: [] },
        'twilio',
        client
      )
      assert.equal(message.user_id, null)

      const res = await asAdmin(TEST_ACTOR, () =>
        request(app).post(`/api/leads/${lead.id}/convert`).send({})
      )
      assert.equal(res.status, 201, JSON.stringify(res.body))

      const attached = await smsRepo.getOne(message.id, client)
      assert.equal(attached?.user_id, res.body.id, "the lead's message was not attached to the new customer")
    },
    { lock: LOCKS.USERS, actor: TEST_ACTOR.id }
  )
})

test('converting carries the lead sms consent and its method onto the new customer', async () => {
  await inPinnedTransaction(
    async (client) => {
      const tag = aTag()
      const lead = await aLead(client, {
        name: `Consent Fixture ${tag}`,
        phone: '5125550097',
        email: `${tag}@dorado.test`,
      })
      await client.query(
        'UPDATE leads.leads SET sms_consent_at = now(), sms_consent_method = $2 WHERE id = $1',
        [lead.id, 'verbal']
      )

      const res = await asAdmin(TEST_ACTOR, () =>
        request(app).post(`/api/leads/${lead.id}/convert`).send({})
      )
      assert.equal(res.status, 201, JSON.stringify(res.body))

      const { rows } = await client.query(
        'SELECT sms_consent_at, sms_consent_method FROM auth.users WHERE id = $1',
        [res.body.id]
      )
      assert.ok(rows[0]?.sms_consent_at, "the lead's consent did not carry onto the customer")
      assert.equal(rows[0]?.sms_consent_method, 'verbal')

      const { rows: welcome } = await query<{ body: string }>(
        `SELECT body FROM crm.sms_messages WHERE direction = 'outbound' AND to_number = $1`,
        ['5125550097']
      )
      assert.equal(welcome.length, 1, 'the opt-in welcome text was not sent on conversion')
      assert.match(welcome[0].body, /Welcome to Dorado Metals/)
    },
    { lock: LOCKS.USERS, actor: TEST_ACTOR.id }
  )
})

test('converting a lead with no consent carries none onto the new customer', async () => {
  await inPinnedTransaction(
    async (client) => {
      const tag = aTag()
      const lead = await aLead(client, {
        name: `No Consent Fixture ${tag}`,
        phone: '5125550096',
        email: `${tag}@dorado.test`,
      })

      const res = await asAdmin(TEST_ACTOR, () =>
        request(app).post(`/api/leads/${lead.id}/convert`).send({})
      )
      assert.equal(res.status, 201, JSON.stringify(res.body))

      const { rows } = await client.query('SELECT sms_consent_at FROM auth.users WHERE id = $1', [
        res.body.id,
      ])
      assert.equal(rows[0]?.sms_consent_at, null)
    },
    { lock: LOCKS.USERS, actor: TEST_ACTOR.id }
  )
})

test('converting a lead with no email is refused', async () => {
  await inPinnedTransaction(
    async (client) => {
      const lead = await aLead(client)
      await client.query('UPDATE leads.leads SET email = NULL WHERE id = $1', [lead.id])

      const res = await asAdmin(TEST_ACTOR, () =>
        request(app).post(`/api/leads/${lead.id}/convert`).send({})
      )
      assert.equal(res.status, 422, JSON.stringify(res.body))
    },
    { lock: LOCKS.USERS, actor: TEST_ACTOR.id }
  )
})

test('a non-admin is refused', async () => {
  await inPinnedTransaction(
    async (client) => {
      const lead = await aLead(client)

      const asCustomer = await asUser({ id: TEST_ACTOR.id, role: 'user' }, () =>
        request(app).post(`/api/leads/${lead.id}/convert`).send({})
      )
      assert.ok([401, 403].includes(asCustomer.status))

      const asAnon = await anonymous(() =>
        request(app).post(`/api/leads/${lead.id}/convert`).send({})
      )
      assert.ok([401, 403].includes(asAnon.status))
    },
    { lock: LOCKS.USERS, actor: TEST_ACTOR.id }
  )
})
