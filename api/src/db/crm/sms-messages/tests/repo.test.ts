import { test, afterAll } from 'vitest'
import assert from 'node:assert/strict'
import pool from '#pool'
import { inPinnedTransaction } from '#shared/testing/pinned-pool.ts'
import { TEST_ACTOR } from '#shared/testing/actor.ts'
import { LOCKS } from '#shared/testing/locks.ts'
import { aUser } from '#shared/testing/builders/index.ts'
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
      const row = await repo.createOutbound('twilio', '+15125550000', '+15125550002', 'hey', [], client)
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

test('an inbound message starts unread, an outbound one starts read', async () => {
  await inPinnedTransaction(
    async (client) => {
      const inbound = await repo.upsertInbound(
        { provider_sid: aSid(), from_number: '+15125550004', to_number: '+15125550000', body: 'x', media: [] },
        'twilio',
        client
      )
      assert.equal(inbound.read_at, null)

      const outbound = await repo.createOutbound(
        'twilio',
        '+15125550000',
        '+15125550005',
        'hey',
        [],
        client
      )
      assert.ok(outbound.read_at, 'an outbound message should be read by definition')
    },
    { actor: TEST_ACTOR.id }
  )
})

test('markRead clears unread inbound messages for a number and leaves others alone', async () => {
  await inPinnedTransaction(
    async (client) => {
      const number = '+15125550006'
      const other = '+15125550007'
      const mine = await repo.upsertInbound(
        { provider_sid: aSid(), from_number: number, to_number: '+15125550000', body: 'a', media: [] },
        'twilio',
        client
      )
      const theirs = await repo.upsertInbound(
        { provider_sid: aSid(), from_number: other, to_number: '+15125550000', body: 'b', media: [] },
        'twilio',
        client
      )

      await repo.markRead(null, number, client)

      assert.ok((await repo.getOne(mine.id, client))?.read_at, 'the matched conversation is still unread')
      assert.equal(
        (await repo.getOne(theirs.id, client))?.read_at,
        null,
        'an unrelated conversation was marked read'
      )
    },
    { actor: TEST_ACTOR.id }
  )
})

test('attachToUser matches on the last 10 digits regardless of formatting', async () => {
  await inPinnedTransaction(
    async (client) => {
      const message = await repo.upsertInbound(
        { provider_sid: aSid(), from_number: '+15125550008', to_number: '+15125550000', body: 'a', media: [] },
        'twilio',
        client
      )
      assert.equal(message.user_id, null)

      const user = await aUser(client)
      await repo.attachToUser('5125550008', user.id, client)

      assert.equal((await repo.getOne(message.id, client))?.user_id, user.id)
    },
    { lock: LOCKS.USERS, actor: TEST_ACTOR.id }
  )
})
