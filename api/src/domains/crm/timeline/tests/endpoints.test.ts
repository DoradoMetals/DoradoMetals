import { test, afterAll } from 'vitest'
import assert from 'node:assert/strict'
import request from 'supertest'
import pool from '#pool'
import { mockSessions, restoreSessions, as, anonymous } from '#shared/testing/session.ts'
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
