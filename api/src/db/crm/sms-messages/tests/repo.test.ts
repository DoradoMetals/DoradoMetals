import { test, afterAll } from 'vitest'
import assert from 'node:assert/strict'
import pool from '#pool'
import { inPinnedTransaction } from '#shared/testing/pinned-pool.ts'
import { TEST_ACTOR } from '#shared/testing/actor.ts'
import * as repo from '#db/crm/sms-messages/repo.ts'

afterAll(async () => {
  await pool.end()
})

let counter = 0
const aSid = () => `SMrepo${String((counter += 1)).padStart(26, '0')}`

test('upsertInbound is idempotent on provider_sid', async () => {
  await inPinnedTransaction(
    async (client) => {
      const input = {
        provider_sid: aSid(),
        from_number: '+15125550001',
        to_number: '+15125550000',
        body: 'hi',
        media: [],
      }
      const first = await repo.upsertInbound(input, 'twilio', client)
      const second = await repo.upsertInbound(input, 'twilio', client)
      assert.equal(first.id, second.id)

      const rows = await repo.conversation(null, '+15125550001', client)
      assert.equal(rows.filter((r) => r.provider_sid === input.provider_sid).length, 1)
    },
    { actor: TEST_ACTOR.id }
  )
})

test('createOutbound then markSent updates the provider_sid and sent_at', async () => {
  await inPinnedTransaction(
    async (client) => {
      const row = await repo.createOutbound('twilio', '+15125550000', '+15125550002', 'hey', client)
      assert.equal(row.status, 'queued')
      assert.ok(row.provider_sid.startsWith('pending:'))
      assert.equal(row.sent_at, null)

      const sid = aSid()
      const updated = await repo.markSent(row.id, sid, client)
      assert.equal(updated.provider_sid, sid)
      assert.ok(updated.sent_at)
    },
    { actor: TEST_ACTOR.id }
  )
})

test('getByProviderSid and getOne agree on the same row', async () => {
  await inPinnedTransaction(
    async (client) => {
      const sid = aSid()
      const created = await repo.upsertInbound(
        { provider_sid: sid, from_number: '+15125550003', to_number: '+15125550000', body: 'x', media: [] },
        'twilio',
        client
      )
      const byId = await repo.getOne(created.id, client)
      const bySid = await repo.getByProviderSid(sid, client)
      assert.equal(byId?.id, bySid?.id)
    },
    { actor: TEST_ACTOR.id }
  )
})
