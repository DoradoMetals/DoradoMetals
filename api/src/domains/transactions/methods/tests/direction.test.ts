import { test, afterAll } from 'vitest'
import assert from 'node:assert/strict'
import request from 'supertest'
import { mockSessions, restoreSessions } from '#shared/testing/session.ts'

await mockSessions()
const { default: app } = await import('#app')

afterAll(() => restoreSessions())

test('GET /api/payments/methods with no direction answers both directions', async () => {
  const res = await request(app).get('/api/payments/methods')
  assert.equal(res.status, 200, JSON.stringify(res.body))
  const directions = new Set((res.body as Array<{ direction: string }>).map((r) => r.direction))
  assert.ok(directions.has('purchase'), 'expected a purchase row')
  assert.ok(directions.has('sale'), 'expected a sale row')
})

test('GET /api/payments/methods?direction=sale answers only sale rows', async () => {
  const res = await request(app).get('/api/payments/methods').query({ direction: 'sale' })
  assert.equal(res.status, 200, JSON.stringify(res.body))
  const rows = res.body as Array<{ direction: string }>
  assert.ok(rows.length > 0, 'expected at least one sale row')
  for (const row of rows) assert.equal(row.direction, 'sale')
})

test('GET /api/payments/methods?direction=sideways refuses with a 400 naming direction', async () => {
  const res = await request(app).get('/api/payments/methods').query({ direction: 'sideways' })
  assert.equal(res.status, 400, JSON.stringify(res.body))
  assert.match(res.body?.error?.message ?? '', /direction/)
})
