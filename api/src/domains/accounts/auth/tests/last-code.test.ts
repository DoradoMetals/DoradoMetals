import { test, afterAll, vi } from 'vitest'
import assert from 'node:assert/strict'
import request from 'supertest'
import pool from '#pool'
import { isFake } from '#providers/sms/index.ts'
import * as fakeSms from '#providers/sms/fake.ts'
import { readsBackCodes } from '#accounts/auth/routes.ts'

const { default: app } = await import('#app')

afterAll(async () => {
  fakeSms.reset()
  await pool.end()
})

const pathsOf = (router: unknown): string[] =>
  ((router as { stack?: { route?: { path?: string } }[] }).stack ?? [])
    .map((layer) => layer.route?.path ?? '')
    .filter(Boolean)

test('the read-back is mounted while the recording fake is the adapter in use', async () => {
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

test('the read-back route does not exist at all once a real carrier is selected', async () => {
  const saved = process.env.SMS_PROVIDER
  process.env.SMS_PROVIDER = 'twilio'
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
    if (saved === undefined) delete process.env.SMS_PROVIDER
    else process.env.SMS_PROVIDER = saved
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
