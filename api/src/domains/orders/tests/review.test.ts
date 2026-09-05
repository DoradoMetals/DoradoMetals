import { test, afterAll } from 'vitest'
import assert from 'node:assert/strict'
import type { PoolClient } from 'pg'
import request from 'supertest'
import pool from '#pool'
import query from '#shared/db/query.ts'
import { mockSessions, restoreSessions, as } from '#shared/testing/session.ts'
import { TEST_ACTOR } from '#shared/testing/actor.ts'
import { inPinnedTransaction } from '#shared/testing/pinned-pool.ts'
import { LOCKS } from '#shared/testing/locks.ts'
import { aUser, anOrder, anUnknownId } from '#shared/testing/builders/index.ts'

await mockSessions()
const { default: app } = await import('#app')

afterAll(async () => {
  restoreSessions()
  await pool.end()
})

const caller = (u: { id: string; name: string | null; email: string | null }) => ({
  id: u.id,
  name: u.name,
  email: u.email,
  role: 'user',
})

test('the review action stamps the order it names in the path', async () => {
  await inPinnedTransaction(
    async (c: PoolClient) => {
      const customer = await aUser(c)
      const order = await anOrder(c, customer, { direction: 'purchase' }).withLots(1)

      const res = await as(caller(customer), () =>
        request(app).post(`/api/orders/${order.id}/review`)
      )

      assert.equal(res.status, 200, res.text)
      assert.equal(res.body.order.id, order.id)
      assert.equal(res.body.order.review_created, true)

      const { rows } = await query<{ review_created: boolean | null }>(
        `SELECT review_created FROM orders.orders WHERE id = $1`,
        [order.id],
        c
      )
      assert.equal(rows[0]?.review_created, true)
    },
    { actor: TEST_ACTOR.id, lock: [LOCKS.ORDERS, LOCKS.USERS] }
  )
})

test("a stranger cannot stamp somebody else's order, and an unknown id is a 404", async () => {
  await inPinnedTransaction(
    async (c: PoolClient) => {
      const owner = await aUser(c)
      const stranger = await aUser(c)
      const order = await anOrder(c, owner, { direction: 'sale' }).withLots(1)

      const theirs = await as(caller(stranger), () =>
        request(app).post(`/api/orders/${order.id}/review`)
      )
      assert.equal(theirs.status, 403, theirs.text)

      const missing = await as({ ...TEST_ACTOR, role: 'admin' }, () =>
        request(app).post(`/api/orders/${anUnknownId()}/review`)
      )
      assert.equal(missing.status, 404, missing.text)

      const { rows } = await query<{ review_created: boolean | null }>(
        `SELECT review_created FROM orders.orders WHERE id = $1`,
        [order.id],
        c
      )
      assert.notEqual(rows[0]?.review_created, true, 'a refused call still wrote')
    },
    { actor: TEST_ACTOR.id, lock: [LOCKS.ORDERS, LOCKS.USERS] }
  )
})
