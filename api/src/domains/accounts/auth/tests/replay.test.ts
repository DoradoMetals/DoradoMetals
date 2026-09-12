import { test, afterAll, beforeAll } from 'vitest'
import assert from 'node:assert/strict'
import request from 'supertest'
import pool from '#pool'
import { outside } from '#shared/testing/pinned-pool.ts'

const { default: app } = await import('#app')

let credentialsBefore: number

beforeAll(async () => {
  credentialsBefore = (await outside(`SELECT count(*)::int AS n FROM auth.account`))[0].n
  assert.equal(typeof credentialsBefore, 'number', 'the baseline count was not taken')
})

afterAll(async () => {
  await pool.end()
})

test('the password endpoint is gone, not merely unguarded', async () => {
  const res = await request(app)
    .post('/api/account/set_password')
    .send({ newPassword: 'this-should-never-be-set' })
  assert.equal(res.status, 404, `set_password answered ${res.status}; it must not exist at all`)
})

test('every signed-in surface refuses a caller with no session', async () => {
  for (const [method, path, body] of [
    ['post', '/api/account/step_up', {}],
    ['post', '/api/account/change_email', { email: 'x@dorado.test' }],
    ['post', '/api/account/change_phone', { phone_number: '+15125550134' }],
    ['post', '/api/account/confirm_change', { code: '418209' }],
    ['get', '/api/account/session', undefined],
  ] as const) {
    const req = method === 'get' ? request(app).get(path) : request(app).post(path).send(body)
    const res = await req
    assert.ok(
      [401, 403].includes(res.status),
      `${method.toUpperCase()} ${path} answered ${res.status} with no session`
    )
  }
})

test('a body that is not the contract is refused before anything is minted', async () => {
  const cases = [
    ['/api/account/send_code', undefined],
    ['/api/account/send_code', {}],
    ['/api/account/send_code', { channel: 'carrier-pigeon', captcha_token: 't' }],
    ['/api/account/send_code', { channel: 'sms', phone_number: 5125550134, captcha_token: 't' }],
    // captcha_token is optional now (Jacob's amendment, 2026-09-11: no token on
    // a pending resend) - a body with no token is a valid SHAPE, not a contract
    // violation, so it belongs with send-code.test.ts's captchaRequired cases,
    // not here.
    [
      '/api/account/send_code',
      { channel: 'sms', phone_number: '+15125550134', captcha_token: 't', admin: true },
    ],
    ['/api/account/verify_code', {}],
    ['/api/account/verify_code', { channel: 'sms', phone_number: '+15125550134' }],
    ['/api/account/verify_code', { channel: 'sms', phone_number: '+15125550134', code: 418209 }],
    ['/api/account/sign_up', {}],
    [
      '/api/account/sign_up',
      { name: 'A', email: 'a@dorado.test', phone_number: '+15125550134', captcha_token: 't' },
    ],
    [
      '/api/account/sign_up',
      {
        name: 'A',
        email: 'a@dorado.test',
        phone_number: '+15125550134',
        accepted_terms: false,
        captcha_token: 't',
      },
    ],
  ] as const

  for (const [path, payload] of cases) {
    const req = request(app).post(path)
    const res = payload === undefined ? await req : await req.send(payload)
    assert.equal(res.status, 400, `${path} accepted ${JSON.stringify(payload)}`)
  }
})

test('terms are a literal true, so an omitted tick cannot be a sign-up', async () => {
  const res = await request(app).post('/api/account/sign_up').send({
    name: 'A',
    email: 'a@dorado.test',
    phone_number: '+15125550134',
    accepted_terms: 'yes',
    captcha_token: 't',
  })
  assert.equal(res.status, 400)
})

test('this suite created no account credential', async () => {
  const rows = await outside(`SELECT count(*)::int AS n FROM auth.account`)
  assert.equal(
    rows[0].n,
    credentialsBefore,
    'the auth suite changed auth.account - the pin does not contain better-auth, ' +
      'so anything this file writes is COMMITTED to the test database'
  )
})
