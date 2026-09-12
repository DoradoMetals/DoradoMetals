import { test, afterAll } from 'vitest'
import assert from 'node:assert/strict'
import request from 'supertest'
import pool from '#pool'
import { mockSessions, restoreSessions, as, anonymous } from '#shared/testing/session.ts'
import { TEST_ACTOR } from '#shared/testing/actor.ts'
import { LOCKS } from '#shared/testing/locks.ts'
import { inPinnedTransaction } from '#shared/testing/pinned-pool.ts'
import { aUser } from '#shared/testing/builders/index.ts'
import * as sms from '#crm/sms/service.ts'

await mockSessions()
const { default: app } = await import('#app')

afterAll(async () => {
  restoreSessions()
  await pool.end()
})

const asAdmin = <T>(id: string, fn: () => Promise<T> | T) => as({ id, role: 'admin' }, fn)

test('the conversation read is one query, oldest first', async () => {
  await inPinnedTransaction(
    async (client) => {
      const phone = '+15125559101'
      const user = await aUser(client, { phone_number: phone })

      await client.query(
        `INSERT INTO crm.sms_messages
                (direction, provider, provider_sid, from_number, to_number, body, status, user_id, created_at)
         VALUES ('outbound', 'twilio', 'SMorder0000000000000000000001', $1, $2, 'first message', 'queued', $3, now() - interval '2 minutes')`,
        ['+15125550000', phone, user.id]
      )
      await client.query(
        `INSERT INTO crm.sms_messages
                (direction, provider, provider_sid, from_number, to_number, body, status, user_id, created_at)
         VALUES ('outbound', 'twilio', 'SMorder0000000000000000000002', $1, $2, 'second message', 'queued', $3, now() - interval '1 minute')`,
        ['+15125550000', phone, user.id]
      )

      await asAdmin(TEST_ACTOR.id, async () => {
        const res = await request(app).get(`/api/sms?user_id=${user.id}`)
        assert.equal(res.status, 200)
        const bodies = res.body.map((m: { body: string }) => m.body)
        assert.deepEqual(bodies, ['first message', 'second message'])
      })
    },
    { lock: LOCKS.USERS, actor: TEST_ACTOR.id }
  )
})

test('an anonymous caller is refused the admin reads', async () => {
  await inPinnedTransaction(
    async () => {
      await anonymous(async () => {
        const res = await request(app).get('/api/sms')
        assert.ok([401, 403].includes(res.status))
      })
    },
    { lock: LOCKS.USERS, actor: TEST_ACTOR.id }
  )
})

test('sendMessage writes the row before returning', async () => {
  await inPinnedTransaction(
    async () => {
      const row = await sms.sendMessage('+15125559199', 'a conversational reply')
      assert.equal(row.direction, 'outbound')
      assert.equal(row.to_number, '+15125559199')
      assert.ok(row.id)
    },
    { lock: LOCKS.USERS, actor: TEST_ACTOR.id }
  )
})
