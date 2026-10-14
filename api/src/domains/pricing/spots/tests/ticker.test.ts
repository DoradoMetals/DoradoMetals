import { test, afterAll } from 'vitest'
import assert from 'node:assert/strict'
import request from 'supertest'
import pool from '#pool'
import { mockSessions, restoreSessions } from '#shared/testing/session.ts'
import { SpotTickerRow } from '@dorado/contracts'

await mockSessions()
const { default: app } = await import('#app')

afterAll(async () => {
  restoreSessions()
  await pool.end()
})

test('the ticker answers without a session, is cacheable, and carries only the bar fields', async () => {
  const res = await request(app).get('/api/spots/ticker')
  assert.equal(res.status, 200)
  assert.equal(res.headers['cache-control'], 'public, max-age=15')
  assert.ok(Array.isArray(res.body) && res.body.length > 0)
  const fields = Object.keys(SpotTickerRow.shape).sort()
  for (const row of res.body) {
    assert.deepEqual(Object.keys(row).sort(), fields)
    SpotTickerRow.parse(row)
  }
})
