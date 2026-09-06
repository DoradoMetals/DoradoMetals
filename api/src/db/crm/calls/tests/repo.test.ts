import { test, afterAll } from 'vitest'
import assert from 'node:assert/strict'
import pool from '#pool'
import { inPinnedTransaction } from '#shared/testing/pinned-pool.ts'
import { TEST_ACTOR } from '#shared/testing/actor.ts'
import { LOCKS } from '#shared/testing/locks.ts'
import { aUser } from '#shared/testing/builders/index.ts'
import * as repo from '#db/crm/calls/repo.ts'

afterAll(async () => {
  await pool.end()
})

let counter = 0
const aSid = () => `CArepo${String((counter += 1)).padStart(26, '0')}`

test('create is idempotent on provider_sid (a retried initial webhook hit)', async () => {
  await inPinnedTransaction(
    async (client) => {
      const sid = aSid()
      const first = await repo.create(
        'twilio',
        sid,
        'inbound',
        '+15125550001',
        '+15125550000',
        null,
        'ringing',
        '+15125550001',
        client
      )
      const second = await repo.create(
        'twilio',
        sid,
        'inbound',
        '+15125550001',
        '+15125550000',
        null,
        'ringing',
        '+15125550001',
        client
      )
      assert.equal(first.id, second.id)
    },
    { actor: TEST_ACTOR.id }
  )
})

test('user_id is matched by a verified phone at write time', async () => {
  await inPinnedTransaction(
    async (client) => {
      const user = await aUser(client, { phone_number: '+15125559201' })
      await client.query('UPDATE auth.users SET phone_number_verified = true WHERE id = $1', [
        user.id,
      ])

      const row = await repo.create(
        'twilio',
        aSid(),
        'inbound',
        '+15125559201',
        '+15125550000',
        null,
        'ringing',
        '+15125559201',
        client
      )
      assert.equal(row.user_id, user.id)
    },
    { lock: LOCKS.USERS, actor: TEST_ACTOR.id }
  )
})

test('markRecording sets recording_url and the voicemail status', async () => {
  await inPinnedTransaction(
    async (client) => {
      const row = await repo.create(
        'twilio',
        aSid(),
        'inbound',
        '+15125550001',
        '+15125550000',
        null,
        'ringing',
        '+15125550001',
        client
      )
      const updated = await repo.markRecording(row.id, 'https://api.twilio.com/rec.mp3', client)
      assert.equal(updated.status, 'voicemail')
      assert.equal(updated.recording_url, 'https://api.twilio.com/rec.mp3')
      assert.ok(updated.ended_at)
    },
    { actor: TEST_ACTOR.id }
  )
})

test('applyStatus stamps ended_at for a terminal status and not for ringing', async () => {
  await inPinnedTransaction(
    async (client) => {
      const row = await repo.create(
        'twilio',
        aSid(),
        'outbound',
        '+15125550000',
        '+15125550002',
        null,
        'queued',
        '+15125550002',
        client
      )
      const ringing = await repo.applyStatus(row.id, 'ringing', null, client)
      assert.equal(ringing.ended_at, null)

      const completed = await repo.applyStatus(row.id, 'completed', 42, client)
      assert.ok(completed.ended_at)
      assert.equal(completed.duration_seconds, 42)
    },
    { actor: TEST_ACTOR.id }
  )
})
