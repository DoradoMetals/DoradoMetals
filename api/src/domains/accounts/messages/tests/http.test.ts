import { test, afterEach, afterAll, vi } from 'vitest'
import assert from 'node:assert/strict'
import request from 'supertest'
import pool from '#pool'
import { mockSessions, restoreSessions, asUser, anonymous } from '#shared/testing/session.ts'
import { TEST_CUSTOMER } from '#shared/testing/actor.ts'
import * as fakeEmail from '#providers/resend/fake.ts'
import * as fakeSms from '#providers/twilio/fake.ts'
import { messagesEnabled } from '#accounts/messages/routes.ts'

await mockSessions()
const { default: app } = await import('#app')

const PHONE = '+15125550199'
const OTHER_PHONE = '+15125550142'

const pendingCookie = (value: string): string => `dorado.last_code_to=${encodeURIComponent(value)}`

const sendMail = async (to: string, subject: string, html: string): Promise<string> => {
  const sent = (await fakeEmail.transport().sendMail({ to, subject, html })) as {
    messageId: string
  }
  return sent.messageId
}

afterEach(() => {
  fakeEmail.reset()
  fakeSms.reset()
})
afterAll(async () => {
  restoreSessions()
  await pool.end()
})

test('a signed-in caller lists the email sent to them, newest first, and nobody else’s', async () => {
  assert.equal(messagesEnabled, true, 'the suite runs on the fakes outside production')
  await sendMail(TEST_CUSTOMER.email, 'Order received', '<p>received</p>')
  await sendMail('someone-else@example.com', 'Not yours', '<p>no</p>')
  await sendMail(TEST_CUSTOMER.email.toUpperCase(), 'Payout sent', '<p>paid</p>')
  await fakeSms.send(OTHER_PHONE, 'code 999999')

  const res = await asUser(TEST_CUSTOMER, () => request(app).get('/api/account/messages'))
  assert.equal(res.status, 200)
  assert.deepEqual(
    res.body.map((message: { subject: string }) => message.subject),
    ['Payout sent', 'Order received']
  )
  assert.equal(res.body[0].channel, 'email')
  assert.equal(res.body[0].preview, null)
  assert.ok(!('html' in res.body[0]), 'the list carries no html')
})

test('a signed-in caller also sees the message sent to the pending verification', async () => {
  await sendMail('new-address@example.com', 'Confirm your new email', '<p>123456</p>')
  const res = await asUser(TEST_CUSTOMER, () =>
    request(app)
      .get('/api/account/messages')
      .set('Cookie', pendingCookie('email:new-address@example.com'))
  )
  assert.equal(res.status, 200)
  assert.equal(res.body.length, 1)
  assert.equal(res.body[0].subject, 'Confirm your new email')
})

test('a signed-in caller opens their email and gets the stored html', async () => {
  const id = await sendMail(TEST_CUSTOMER.email, 'Your code', '<p>481920 is your code.</p>')
  const res = await asUser(TEST_CUSTOMER, () =>
    request(app).get(`/api/account/messages/${encodeURIComponent(id)}`)
  )
  assert.equal(res.status, 200)
  assert.match(res.headers['content-type'] ?? '', /text\/html/)
  assert.equal(res.text, '<p>481920 is your code.</p>')
})

test('an anonymous caller lists the sms sent to the pending number in the cookie', async () => {
  await fakeSms.send(PHONE, 'Your Dorado code is 481920.')
  await fakeSms.send(OTHER_PHONE, 'Your Dorado code is 111111.')
  await sendMail(TEST_CUSTOMER.email, 'Not for the cookie', '<p>no</p>')

  const res = await anonymous(() =>
    request(app)
      .get('/api/account/messages')
      .set('Cookie', pendingCookie(`sms:${PHONE}`))
  )
  assert.equal(res.status, 200)
  assert.equal(res.body.length, 1)
  assert.equal(res.body[0].channel, 'sms')
  assert.equal(res.body[0].to, PHONE)
  assert.equal(res.body[0].subject, null)
  assert.equal(res.body[0].preview, 'Your Dorado code is 481920.')
})

test('an anonymous caller opens the sms as a phone-style page with the code', async () => {
  const sent = await fakeSms.send(PHONE, 'Your Dorado code is 481920.')
  const res = await anonymous(() =>
    request(app)
      .get(`/api/account/messages/${sent.provider_sid}`)
      .set('Cookie', pendingCookie(`sms:${PHONE}`))
  )
  assert.equal(res.status, 200)
  assert.match(res.headers['content-type'] ?? '', /text\/html/)
  assert.match(res.text, /481920/)
  assert.match(res.text, /data-testid="sms-message"/)
})

test('an anonymous caller lists the email sent to the pending address in the cookie', async () => {
  await sendMail('pending@example.com', 'Your sign-in code', '<p>222222</p>')
  const res = await anonymous(() =>
    request(app)
      .get('/api/account/messages')
      .set('Cookie', pendingCookie('email:pending@example.com'))
  )
  assert.equal(res.status, 200)
  assert.equal(res.body.length, 1)
  assert.equal(res.body[0].subject, 'Your sign-in code')
})

test('an anonymous caller with no pending cookie lists nothing', async () => {
  await sendMail('pending@example.com', 'Your sign-in code', '<p>222222</p>')
  const res = await anonymous(() => request(app).get('/api/account/messages'))
  assert.equal(res.status, 200)
  assert.deepEqual(res.body, [])
})

test('a message addressed to someone else is a 404, signed in or not', async () => {
  const mail = await sendMail('someone-else@example.com', 'Not yours', '<p>no</p>')
  const text = await fakeSms.send(OTHER_PHONE, 'code 999999')

  const signedIn = await asUser(TEST_CUSTOMER, () =>
    request(app).get(`/api/account/messages/${encodeURIComponent(mail)}`)
  )
  assert.equal(signedIn.status, 404)

  const pending = await anonymous(() =>
    request(app)
      .get(`/api/account/messages/${text.provider_sid}`)
      .set('Cookie', pendingCookie(`sms:${PHONE}`))
  )
  assert.equal(pending.status, 404)

  const bare = await anonymous(() =>
    request(app).get(`/api/account/messages/${encodeURIComponent(mail)}`)
  )
  assert.equal(bare.status, 404)
})

test('an unknown message id is a 404', async () => {
  const res = await asUser(TEST_CUSTOMER, () =>
    request(app).get('/api/account/messages/not-a-real-id')
  )
  assert.equal(res.status, 404)
})

test('the message routes do not exist in production', async () => {
  const saved = process.env.NODE_ENV
  process.env.NODE_ENV = 'production'
  vi.resetModules()
  try {
    const fresh = await import('#accounts/messages/routes.ts')
    assert.equal(fresh.messagesEnabled, false)
    const paths = ((fresh.default as { stack?: { route?: { path?: string } }[] }).stack ?? [])
      .map((layer) => layer.route?.path ?? '')
      .filter(Boolean)
    assert.equal(paths.length, 0, 'no route is mounted, so there is no guard to get past')
  } finally {
    process.env.NODE_ENV = saved
    vi.resetModules()
  }
})

test('the message routes do not exist when both real providers are in use', async () => {
  const savedKey = process.env.RESEND_API_KEY
  const savedSms = process.env.SMS_PROVIDER
  const savedEnv = process.env.NODE_ENV
  process.env.RESEND_API_KEY = 're_test_key'
  process.env.SMS_PROVIDER = 'twilio'
  process.env.NODE_ENV = 'development'
  vi.resetModules()
  try {
    const fresh = await import('#accounts/messages/routes.ts')
    assert.equal(fresh.messagesEnabled, false)
  } finally {
    if (savedKey === undefined) delete process.env.RESEND_API_KEY
    else process.env.RESEND_API_KEY = savedKey
    if (savedSms === undefined) delete process.env.SMS_PROVIDER
    else process.env.SMS_PROVIDER = savedSms
    process.env.NODE_ENV = savedEnv
    vi.resetModules()
  }
})
