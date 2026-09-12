import { test, afterAll, vi } from 'vitest'
import assert from 'node:assert/strict'
import request from 'supertest'
import pool from '#pool'
import { isFake } from '#providers/twilio/index.ts'
import { isFake as emailIsFake } from '#providers/resend/index.ts'
import * as fakeSms from '#providers/twilio/fake.ts'
import * as fakeEmail from '#providers/resend/fake.ts'
import { sendSignInCode } from '#documents/emails/service.ts'
import { readsBackCodes } from '#accounts/auth/routes.ts'

const { default: app } = await import('#app')

afterAll(async () => {
  fakeSms.reset()
  fakeEmail.reset()
  await pool.end()
})

const pathsOf = (router: unknown): string[] =>
  ((router as { stack?: { route?: { path?: string } }[] }).stack ?? [])
    .map((layer) => layer.route?.path ?? '')
    .filter(Boolean)

test('the read-back is mounted while the recording SMS fake is the adapter in use', async () => {
  assert.equal(isFake(), true, 'the suite must not be running against a real carrier')
  assert.equal(readsBackCodes, true)

  await fakeSms.send('+15125559100', '418209 is your Dorado Metals code.')
  const res = await request(app).get('/api/account/last_code').query({ number: '+15125559100' })
  assert.equal(res.status, 200)
  assert.equal(res.body.code, '418209')

  const missing = await request(app).get('/api/account/last_code').query({ number: '+15125559199' })
  assert.equal(missing.status, 200)
  assert.equal(missing.body.code, null, 'a number nothing was sent to is null, not an error')

  const noQuery = await request(app).get('/api/account/last_code')
  assert.equal(noQuery.status, 400)
})

test('a sign-in code by email lands in the fake and is readable the same way', async () => {
  assert.equal(emailIsFake(), true, 'the suite must not be running against a real mail server')
  assert.equal(readsBackCodes, true)

  await sendSignInCode({
    order_id: null,
    user_id: null,
    email: 'someone@example.com',
    name: 'Someone',
    code: '512340',
    expires_in_minutes: 10,
  })

  const res = await request(app).get('/api/account/last_code').query({ email: 'someone@example.com' })
  assert.equal(res.status, 200)
  assert.equal(res.body.code, '512340')

  const missing = await request(app)
    .get('/api/account/last_code')
    .query({ email: 'nobody@example.com' })
  assert.equal(missing.status, 200)
  assert.equal(missing.body.code, null, 'an address nothing was sent to is null, not an error')
})

test('neither number nor email answers 400, not a silent null', async () => {
  const res = await request(app).get('/api/account/last_code')
  assert.equal(res.status, 400)
})

test('the read-back route stays mounted when only one channel loses its fake', async () => {
  const saved = process.env.SMS_PROVIDER
  process.env.SMS_PROVIDER = 'twilio'
  vi.resetModules()
  try {
    const fresh = await import('#accounts/auth/routes.ts')
    assert.equal(
      fresh.readsBackCodes,
      true,
      'the email fake is still active, so the route has a reason to exist'
    )
    assert.ok(pathsOf(fresh.default).includes('/last_code'))
  } finally {
    if (saved === undefined) delete process.env.SMS_PROVIDER
    else process.env.SMS_PROVIDER = saved
    vi.resetModules()
  }
})

test('the read-back route does not exist at all once both channels use a real provider', async () => {
  const savedSms = process.env.SMS_PROVIDER
  const savedResendKey = process.env.RESEND_API_KEY
  const savedNodeEnv = process.env.NODE_ENV
  process.env.SMS_PROVIDER = 'twilio'
  process.env.RESEND_API_KEY = 're_test_key'
  process.env.NODE_ENV = 'development'
  vi.resetModules()
  try {
    const fresh = await import('#accounts/auth/routes.ts')
    assert.equal(fresh.readsBackCodes, false, 'the decision is taken at mount time')
    assert.ok(
      pathsOf(fresh.default).length > 5,
      'the router read as a router - a check that sees no routes accepts anything'
    )
    assert.ok(
      !pathsOf(fresh.default).includes('/last_code'),
      'there is no route to reach in a real deployment, so there is no guard to get past'
    )
  } finally {
    if (savedSms === undefined) delete process.env.SMS_PROVIDER
    else process.env.SMS_PROVIDER = savedSms
    if (savedResendKey === undefined) delete process.env.RESEND_API_KEY
    else process.env.RESEND_API_KEY = savedResendKey
    process.env.NODE_ENV = savedNodeEnv
    vi.resetModules()
  }
})

test('the read-back route does not exist in production either', async () => {
  const saved = process.env.NODE_ENV
  process.env.NODE_ENV = 'production'
  vi.resetModules()
  try {
    const fresh = await import('#accounts/auth/routes.ts')
    assert.equal(fresh.readsBackCodes, false, 'both halves of the condition are load-bearing')
    assert.ok(!pathsOf(fresh.default).includes('/last_code'))
  } finally {
    process.env.NODE_ENV = saved
    vi.resetModules()
  }
})
