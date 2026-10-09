import { test, afterAll } from 'vitest'
import assert from 'node:assert/strict'
import request from 'supertest'
import pool from '#pool'
import { mockSessions, restoreSessions, asAdmin, anonymous } from '#shared/testing/session.ts'
import { TEST_ACTOR } from '#shared/testing/actor.ts'
import { inPinnedTransaction } from '#shared/testing/pinned-pool.ts'
import { aTag } from '#shared/testing/builders/index.ts'
import * as smsRepo from '#db/crm/sms-messages/repo.ts'
import * as callsRepo from '#db/crm/calls/repo.ts'

await mockSessions()
const { default: app } = await import('#app')

afterAll(async () => {
  restoreSessions()
  await pool.end()
})

test('an unmatched inbound number appears in the inbox as unknown, and unread', async () => {
  await inPinnedTransaction(
    async (client) => {
      const tag = aTag()
      const number = `+1512555${String(Math.floor(1000 + Math.random() * 8999))}`
      await smsRepo.upsertInbound(
        {
          provider_sid: `SMinbox${tag}`,
          from_number: number,
          to_number: '+15125550000',
          body: `hello ${tag}`,
          media: [],
        },
        'twilio',
        client
      )

      const res = await asAdmin(TEST_ACTOR, () => request(app).get('/api/inbox'))
      assert.equal(res.status, 200)
      const row = res.body.find((r: { phone: string }) => r.phone === number)
      assert.ok(row, 'the new conversation is not in the inbox list')
      assert.equal(row.kind, 'unknown')
      assert.equal(row.channel, 'sms')
      assert.equal(row.unread_count, 1)
      assert.equal(row.preview, `hello ${tag}`)
    },
    { actor: TEST_ACTOR.id }
  )
})

test('a voicemail counts as a message and shows its own channel', async () => {
  await inPinnedTransaction(
    async (client) => {
      const number = `+1512555${String(Math.floor(1000 + Math.random() * 8999))}`
      const call = await callsRepo.create(
        'twilio',
        `CAinbox${aTag()}`,
        'inbound',
        number,
        '+15125550000',
        null,
        'ringing',
        number,
        client
      )
      await callsRepo.markRecording(call.id, 'https://api.twilio.com/rec.mp3', client)

      const res = await asAdmin(TEST_ACTOR, () => request(app).get('/api/inbox'))
      const row = res.body.find((r: { phone: string }) => r.phone === number)
      assert.ok(row, 'the voicemail conversation is not in the inbox list')
      assert.equal(row.channel, 'voicemail')
      assert.ok(
        !row.preview.includes('twilio.com'),
        'the inbox preview still renders the raw recording URL as the line a person reads'
      )
      assert.equal(row.preview, 'voicemail', 'a call with no length should preview its status')
    },
    { actor: TEST_ACTOR.id }
  )
})

test('marking a conversation read zeroes its unread count', async () => {
  await inPinnedTransaction(
    async (client) => {
      const number = `+1512555${String(Math.floor(1000 + Math.random() * 8999))}`
      await smsRepo.upsertInbound(
        {
          provider_sid: `SMread${aTag()}`,
          from_number: number,
          to_number: '+15125550000',
          body: 'read me',
          media: [],
        },
        'twilio',
        client
      )

      const before = await asAdmin(TEST_ACTOR, () => request(app).get('/api/inbox'))
      const row = before.body.find((r: { phone: string }) => r.phone === number)
      assert.equal(row.unread_count, 1)

      const marked = await asAdmin(TEST_ACTOR, () =>
        request(app)
          .patch(`/api/inbox/${encodeURIComponent(row.key)}/read`)
          .send({})
      )
      assert.equal(marked.status, 200, JSON.stringify(marked.body))

      const after = await asAdmin(TEST_ACTOR, () => request(app).get('/api/inbox'))
      const updated = after.body.find((r: { phone: string }) => r.phone === number)
      assert.equal(updated.unread_count, 0)
    },
    { actor: TEST_ACTOR.id }
  )
})

test('an invalid conversation key is refused', async () => {
  await inPinnedTransaction(
    async () => {
      const res = await asAdmin(TEST_ACTOR, () =>
        request(app).patch('/api/inbox/not-a-key/read').send({})
      )
      assert.equal(res.status, 422, JSON.stringify(res.body))
    },
    { actor: TEST_ACTOR.id }
  )
})

test('a non-admin is refused', async () => {
  await inPinnedTransaction(
    async () => {
      const res = await anonymous(() => request(app).get('/api/inbox'))
      assert.ok([401, 403].includes(res.status))
    },
    { actor: TEST_ACTOR.id }
  )
})
