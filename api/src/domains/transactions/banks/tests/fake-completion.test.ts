import { test, afterEach, vi } from 'vitest'
import assert from 'node:assert/strict'
import request from 'supertest'
import * as plaid from '#providers/plaid/index.ts'

const NODE_ENV = process.env.NODE_ENV
const PLAID_SECRET = process.env.PLAID_SECRET

afterEach(() => {
  process.env.NODE_ENV = NODE_ENV
  if (PLAID_SECRET === undefined) delete process.env.PLAID_SECRET
  else process.env.PLAID_SECRET = PLAID_SECRET
  vi.resetModules()
})

test('the fake Plaid completion is allowed only off production and only with the fake provider', () => {
  delete process.env.PLAID_SECRET
  process.env.NODE_ENV = 'test'
  assert.equal(plaid.fakeCompletionAllowed(), true)
  process.env.NODE_ENV = 'production'
  assert.equal(plaid.fakeCompletionAllowed(), false)
  process.env.NODE_ENV = 'test'
  process.env.PLAID_SECRET = 'configured'
  assert.equal(plaid.fakeCompletionAllowed(), false)
})

test('under a production environment the fake Plaid completion route does not exist', async () => {
  delete process.env.PLAID_SECRET
  process.env.NODE_ENV = 'production'
  vi.resetModules()
  const { default: app } = await import('#app')
  const res = await request(app).post('/api/webhooks/plaid/fake').send({ link_id: 'x' })
  assert.equal(res.status, 404, res.text)
})
