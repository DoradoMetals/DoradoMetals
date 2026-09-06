import { test, afterAll } from 'vitest'
import assert from 'node:assert/strict'
import pool from '#pool'
import { inPinnedTransaction } from '#shared/testing/pinned-pool.ts'
import { TEST_ACTOR } from '#shared/testing/actor.ts'
import { LOCKS } from '#shared/testing/locks.ts'
import { aUser } from '#shared/testing/builders/index.ts'
import * as repo from '#db/crm/timeline/repo.ts'

afterAll(async () => {
  await pool.end()
})

test('the timeline merges sms, call and email rows in one read, oldest first', async () => {
  await inPinnedTransaction(
    async (client) => {
      const user = await aUser(client)

      await client.query(
        `INSERT INTO crm.sms_messages (direction, provider, provider_sid, from_number, to_number, body, status, user_id, created_at)
         VALUES ('inbound', 'twilio', 'SMtimeline00000000000000000001', '+15125550001', '+15125550000', 'hi', 'received', $1, now() - interval '3 minutes')`,
        [user.id]
      )
      await client.query(
        `INSERT INTO crm.calls (provider, provider_sid, direction, from_number, to_number, status, user_id, started_at)
         VALUES ('twilio', 'CAtimeline00000000000000000001', 'inbound', '+15125550001', '+15125550000', 'completed', $1, now() - interval '2 minutes')`,
        [user.id]
      )
      await client.query(
        `INSERT INTO media.emails (kind, status, to_address, subject, user_id, sent_at)
         VALUES ('account_created', 'sent', 'zz-timeline@dorado.test', 'Welcome', $1, now() - interval '1 minute')`,
        [user.id]
      )

      const rows = await repo.forCustomer(user.id, client)
      const kinds = rows.map((r) => r.kind)
      assert.deepEqual(new Set(kinds), new Set(['sms', 'call', 'email']))

      const timestamps = rows.map((r) => new Date(r.at).getTime())
      for (let i = 1; i < timestamps.length; i += 1) {
        assert.ok(timestamps[i] >= timestamps[i - 1], 'the timeline is not oldest-first')
      }
    },
    { lock: LOCKS.USERS, actor: TEST_ACTOR.id }
  )
})
