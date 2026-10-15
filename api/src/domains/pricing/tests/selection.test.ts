import { test, afterAll } from 'vitest'
import assert from 'node:assert/strict'
import type { PoolClient } from 'pg'
import request from 'supertest'
import pool from '#pool'
import { mockSessions, restoreSessions, as, asAdmin } from '#shared/testing/session.ts'
import { TEST_ACTOR } from '#shared/testing/actor.ts'
import { inPinnedTransaction } from '#shared/testing/pinned-pool.ts'
import { LOCKS } from '#shared/testing/locks.ts'
import { aUser, anOrder } from '#shared/testing/builders/index.ts'

await mockSessions()
const { default: app } = await import('#app')

afterAll(async () => {
  restoreSessions()
  await pool.end()
})

const inOrders = <T>(fn: (c: PoolClient) => Promise<T>) =>
  inPinnedTransaction(fn, { actor: TEST_ACTOR.id, lock: LOCKS.ORDERS })

test('GET /api/pricing/selection sums the repeated order_ids for an admin', async () => {
  await inOrders(async (c) => {
    const owner = await aUser(c)
    const first = await anOrder(c, owner, { direction: 'purchase' }).withLots(2)
    const second = await anOrder(c, owner, { direction: 'purchase' }).withLots(1)

    await asAdmin(TEST_ACTOR, async () => {
      const res = await request(app).get(
        `/api/pricing/selection?order_ids=${first.id}&order_ids=${second.id}`
      )
      assert.equal(res.status, 200, res.text)
      assert.equal(res.body.order_count, 2)
      assert.equal(res.body.lot_count, 3)
      assert.equal(typeof res.body.estimated_value, 'number')
      assert.ok(Array.isArray(res.body.fine_oz))

      const one = await request(app).get('/api/pricing/selection').query({ order_ids: first.id })
      assert.equal(one.status, 200, one.text)
      assert.equal(one.body.order_count, 1)

      const none = await request(app).get('/api/pricing/selection')
      assert.equal(none.status, 400, none.text)
      const bad = await request(app).get('/api/pricing/selection').query({ order_ids: 'nope' })
      assert.equal(bad.status, 400, bad.text)
    })

    await as({ ...owner, role: 'user' }, async () => {
      const res = await request(app).get('/api/pricing/selection').query({ order_ids: first.id })
      assert.equal(res.status, 403, res.text)
    })
  })
})
