import { test, afterEach, afterAll, vi } from 'vitest'
import assert from 'node:assert/strict'
import request from 'supertest'
import pool from '#pool'
import {
  mockSessions,
  restoreSessions,
  asAdmin,
  asUser,
  anonymous,
} from '#shared/testing/session.ts'
import { TEST_ACTOR } from '#shared/testing/actor.ts'
import * as fakeEmail from '#providers/resend/fake.ts'
import { outboxEnabled } from '#documents/outbox/routes.ts'

await mockSessions()
const { default: app } = await import('#app')

afterEach(() => fakeEmail.reset())
afterAll(async () => {
  restoreSessions()
  await pool.end()
})

test('an admin lists the outbox newest first, with no html on the list', async () => {
  assert.equal(outboxEnabled, true, 'the suite must run on the fake transport outside production')

  await fakeEmail
    .transport()
    .sendMail({ to: 'first@example.com', subject: 'First', html: '<p>1</p>' })
  await fakeEmail.transport().sendMail({
    to: 'second@example.com',
    subject: 'Second',
    html: '<p>2</p>',
  })

  const res = await asAdmin(TEST_ACTOR, () => request(app).get('/api/documents/outbox'))
  assert.equal(res.status, 200)
  assert.equal(res.body.length, 2)
  assert.equal(res.body[0].subject, 'Second', 'the newest message is listed first')
  assert.equal(res.body[1].subject, 'First')
  assert.ok(!('html' in res.body[0]), 'the list must not carry the rendered html')
  assert.ok(res.body[0].message_id, 'a message_id is present to fetch the message by')
})

test('an admin fetches one message and gets its rendered html back, links and all', async () => {
  const sent = (await fakeEmail.transport().sendMail({
    to: 'someone@example.com',
    subject: 'Your code',
    html: '<p>481920 is your code. <a href="https://staging.example.com/verify">open</a></p>',
  })) as { messageId: string }

  const res = await asAdmin(TEST_ACTOR, () =>
    request(app).get(`/api/documents/outbox/${encodeURIComponent(sent.messageId)}`)
  )
  assert.equal(res.status, 200)
  assert.match(res.headers['content-type'] ?? '', /text\/html/)
  assert.match(res.text, /481920/)
  assert.match(res.text, /staging\.example\.com\/verify/)
})

test('an unknown message id is a 404', async () => {
  const res = await asAdmin(TEST_ACTOR, () =>
    request(app).get('/api/documents/outbox/not-a-real-id')
  )
  assert.equal(res.status, 404)
})

test('a non-admin is refused', async () => {
  const res = await asUser(TEST_ACTOR, () => request(app).get('/api/documents/outbox'))
  assert.equal(res.status, 403)
})

test('an anonymous caller is refused', async () => {
  const res = await anonymous(() => request(app).get('/api/documents/outbox'))
  assert.equal(res.status, 401)
})

test('the outbox routes do not exist when the real transport is in use', async () => {
  const savedKey = process.env.RESEND_API_KEY
  const savedEnv = process.env.NODE_ENV
  process.env.RESEND_API_KEY = 're_test_key'
  process.env.NODE_ENV = 'development'
  vi.resetModules()
  try {
    const fresh = await import('#documents/outbox/routes.ts')
    assert.equal(fresh.outboxEnabled, false, 'the decision is taken at mount time')
    const paths = ((fresh.default as { stack?: { route?: { path?: string } }[] }).stack ?? [])
      .map((layer) => layer.route?.path ?? '')
      .filter(Boolean)
    assert.ok(
      paths.length === 0,
      'there is no route to reach once a real transport is in use, so there is no guard to get past'
    )
  } finally {
    if (savedKey === undefined) delete process.env.RESEND_API_KEY
    else process.env.RESEND_API_KEY = savedKey
    process.env.NODE_ENV = savedEnv
    vi.resetModules()
  }
})

test('the outbox routes do not exist in production either', async () => {
  const saved = process.env.NODE_ENV
  process.env.NODE_ENV = 'production'
  vi.resetModules()
  try {
    const fresh = await import('#documents/outbox/routes.ts')
    assert.equal(fresh.outboxEnabled, false, 'both halves of the condition are load-bearing')
  } finally {
    process.env.NODE_ENV = saved
    vi.resetModules()
  }
})
