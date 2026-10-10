import { test, afterAll, vi } from 'vitest'
import assert from 'node:assert/strict'
import request from 'supertest'
import type { PoolClient } from 'pg'
import pool from '#pool'
import { isFake } from '#providers/twilio/index.ts'
import { isFake as emailIsFake } from '#providers/resend/index.ts'
import * as fakeSms from '#providers/twilio/fake.ts'
import * as fakeEmail from '#providers/resend/fake.ts'
import { sendSignInCode } from '#documents/emails/service.ts'
import { readsBackCodes } from '#accounts/auth/routes.ts'
import { LAST_CODE_COOKIE } from '#accounts/auth/rules.ts'
import { inPinnedTransaction } from '#shared/testing/pinned-pool.ts'
import { TEST_ACTOR } from '#shared/testing/actor.ts'
import { LOCKS } from '#shared/testing/locks.ts'
import { aUser } from '#shared/testing/builders/index.ts'
import { CODE, stubAuthApi, restoreAuthApi } from '#accounts/auth/tests/harness.ts'

const { default: app } = await import('#app')

afterAll(async () => {
  fakeSms.reset()
  fakeEmail.reset()
  restoreAuthApi()
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
  assert.equal(noQuery.status, 200)
  assert.equal(noQuery.body.code, null, 'no query and no cookie is null, not an error')
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

  const res = await request(app)
    .get('/api/account/last_code')
    .query({ email: 'someone@example.com' })
  assert.equal(res.status, 200)
  assert.equal(res.body.code, '512340')

  const missing = await request(app)
    .get('/api/account/last_code')
    .query({ email: 'nobody@example.com' })
  assert.equal(missing.status, 200)
  assert.equal(missing.body.code, null, 'an address nothing was sent to is null, not an error')
})

test('neither number, email nor cookie answers a clean null, never an error', async () => {
  const res = await request(app).get('/api/account/last_code')
  assert.equal(res.status, 200)
  assert.equal(res.body.code, null)
})

test('the cookie dropped by send_code answers the no-query form when replayed', async () => {
  await inPinnedTransaction(
    async (c: PoolClient) => {
      stubAuthApi(c)
      const phone = '+15125559456'
      await aUser(c, { phone_number: phone })
      await fakeSms.send(phone, `${CODE} is your Dorado Metals code.`)

      const sent = await request(app)
        .post('/api/account/send_code')
        .send({ channel: 'sms', phone_number: phone, captcha_token: 't' })
      assert.equal(sent.status, 200, sent.text)

      const setCookie = sent.headers['set-cookie'] as unknown as string | string[] | undefined
      const cookies = Array.isArray(setCookie) ? setCookie : setCookie ? [setCookie] : []
      const lastCodeCookie = cookies.find((line) => line.startsWith(`${LAST_CODE_COOKIE}=`))
      assert.ok(lastCodeCookie, 'send_code did not drop the read-back cookie')

      const read = await request(app).get('/api/account/last_code').set('Cookie', lastCodeCookie!)
      assert.equal(read.status, 200)
      assert.equal(read.body.code, CODE)
    },
    { actor: TEST_ACTOR.id, lock: LOCKS.USERS }
  )
})

test('auth_fakes reports which providers are the recording fake', async () => {
  assert.equal(isFake(), true, 'the suite must not be running against a real carrier')
  assert.equal(emailIsFake(), true, 'the suite must not be running against a real mail server')

  const res = await request(app).get('/api/account/auth_fakes')
  assert.equal(res.status, 200)
  assert.deepEqual(res.body, { sms: true, email: true })
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
    assert.ok(
      pathsOf(fresh.default).includes('/auth_fakes'),
      'auth_fakes only depends on NODE_ENV, not on a fake being active, so it stays mounted'
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
    assert.ok(
      !pathsOf(fresh.default).includes('/auth_fakes'),
      'auth_fakes must not exist in production either'
    )
  } finally {
    process.env.NODE_ENV = saved
    vi.resetModules()
  }
})
