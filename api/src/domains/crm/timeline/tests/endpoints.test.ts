import { test, afterAll } from 'vitest'
import assert from 'node:assert/strict'
import request from 'supertest'
import pool from '#pool'
import { mockSessions, restoreSessions, as, anonymous } from '#shared/testing/session.ts'
import { TEST_ACTOR } from '#shared/testing/actor.ts'
import { LOCKS } from '#shared/testing/locks.ts'
import { inPinnedTransaction } from '#shared/testing/pinned-pool.ts'
import { aLead, aNote, aUser, anEstimateItem, anOrder } from '#shared/testing/builders/index.ts'

await mockSessions()
const { default: app } = await import('#app')

afterAll(async () => {
  restoreSessions()
  await pool.end()
})

const asAdmin = <T>(id: string, fn: () => Promise<T> | T) => as({ id, role: 'admin' }, fn)

test('the admin timeline read answers 200 for a real customer', async () => {
  await inPinnedTransaction(
    async (client) => {
      const user = await aUser(client)
      await client.query(
        `INSERT INTO crm.sms_messages (direction, provider, provider_sid, from_number, to_number, body, status, user_id)
         VALUES ('inbound', 'twilio', 'SMep0000000000000000000000001', '+15125550001', '+15125550000', 'hi', 'received', $1)`,
        [user.id]
      )

      await asAdmin(TEST_ACTOR.id, async () => {
        const res = await request(app).get(`/api/customers/${user.id}/timeline`)
        assert.equal(res.status, 200)
        assert.ok(Array.isArray(res.body))
        assert.ok(res.body.some((row: { kind: string }) => row.kind === 'sms'))
      })
    },
    { lock: LOCKS.USERS, actor: TEST_ACTOR.id }
  )
})

test('the timeline includes an order and a note when the customer has them', async () => {
  await inPinnedTransaction(
    async (client) => {
      const user = await aUser(client)
      await anOrder(client, user, { direction: 'purchase' })
      await aNote(client, { user_id: user.id }, 'called about a big sale')

      await asAdmin(TEST_ACTOR.id, async () => {
        const res = await request(app).get(`/api/customers/${user.id}/timeline`)
        assert.equal(res.status, 200)
        const kinds = res.body.map((row: { kind: string }) => row.kind)
        assert.ok(kinds.includes('order'), 'no order row in the timeline')
        const note = res.body.find((row: { kind: string }) => row.kind === 'note')
        assert.ok(note, 'no note row in the timeline')
        assert.equal(note.summary, 'called about a big sale')
        assert.equal(note.actor_id, TEST_ACTOR.id, 'the note row names no author')
        assert.equal(note.actor_name, TEST_ACTOR.name)
      })
    },
    { lock: LOCKS.USERS, actor: TEST_ACTOR.id }
  )
})

test('an anonymous caller is refused', async () => {
  await inPinnedTransaction(
    async (client) => {
      const user = await aUser(client)
      await anonymous(async () => {
        const res = await request(app).get(`/api/customers/${user.id}/timeline`)
        assert.ok([401, 403].includes(res.status))
      })
    },
    { lock: LOCKS.USERS, actor: TEST_ACTOR.id }
  )
})

test('the lead timeline answers 200 and every kind the lead actually has', async () => {
  await inPinnedTransaction(
    async (client) => {
      const lead = await aLead(client, { phone: '5125554242' })
      await aNote(client, { lead_id: lead.id }, 'wants a quote on a chain')
      await client.query(
        `INSERT INTO crm.sms_messages
                (direction, provider, provider_sid, from_number, to_number, body, status)
         VALUES ('outbound', 'twilio', 'SMleadep000000000000000000001', '5125550000',
                 '5125554242', 'hello', 'sent')`
      )
      await anEstimateItem(client, lead.id)

      await asAdmin(TEST_ACTOR.id, async () => {
        const res = await request(app).get(`/api/leads/${lead.id}/timeline`)
        assert.equal(res.status, 200, JSON.stringify(res.body))
        const kinds = res.body.map((row: { kind: string }) => row.kind)
        assert.ok(kinds.includes('created'), 'no created row')
        assert.ok(kinds.includes('text'), 'no text row')
        assert.ok(kinds.includes('note'), 'no note row')
        assert.ok(kinds.includes('estimate_item'), 'no estimate line row')
        for (const row of res.body) {
          assert.ok(row.label, `the ${row.kind} row carries no label`)
        }
      })
    },
    { lock: LOCKS.USERS, actor: TEST_ACTOR.id }
  )
})

test('an anonymous caller cannot read a lead timeline', async () => {
  await inPinnedTransaction(
    async (client) => {
      const lead = await aLead(client, { phone: '5125554343' })
      await anonymous(async () => {
        const res = await request(app).get(`/api/leads/${lead.id}/timeline`)
        assert.ok([401, 403].includes(res.status))
      })
    },
    { actor: TEST_ACTOR.id }
  )
})

test('a lead timeline for a non-uuid id is 400', async () => {
  await inPinnedTransaction(
    async () => {
      await asAdmin(TEST_ACTOR.id, async () => {
        assert.equal((await request(app).get('/api/leads/nope/timeline')).status, 400)
      })
    },
    { actor: TEST_ACTOR.id }
  )
})
