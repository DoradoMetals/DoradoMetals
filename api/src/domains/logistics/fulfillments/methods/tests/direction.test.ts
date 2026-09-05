import { test, afterAll } from 'vitest'
import assert from 'node:assert/strict'
import request from 'supertest'
import { mockSessions, restoreSessions, as } from '#shared/testing/session.ts'
import { TEST_CUSTOMER } from '#shared/testing/actor.ts'

await mockSessions()
const { default: app } = await import('#app')

afterAll(() => restoreSessions())

test('GET /api/fulfillments/methods?direction=purchase answers 200', async () => {
  await as(TEST_CUSTOMER, async () => {
    const res = await request(app).get('/api/fulfillments/methods').query({ direction: 'purchase' })
    assert.equal(res.status, 200, JSON.stringify(res.body))
    assert.ok(Array.isArray(res.body))
  })
})

test('GET /api/fulfillments/methods?direction=sideways refuses with a 400 naming direction', async () => {
  await as(TEST_CUSTOMER, async () => {
    const res = await request(app).get('/api/fulfillments/methods').query({ direction: 'sideways' })
    assert.equal(res.status, 400, JSON.stringify(res.body))
    assert.match(res.body?.error?.message ?? '', /direction/)
  })
})

test('GET /api/fulfillments/methods with no direction refuses with a 400 naming direction', async () => {
  await as(TEST_CUSTOMER, async () => {
    const res = await request(app).get('/api/fulfillments/methods')
    assert.equal(res.status, 400, JSON.stringify(res.body))
    assert.match(res.body?.error?.message ?? '', /direction/)
  })
})
