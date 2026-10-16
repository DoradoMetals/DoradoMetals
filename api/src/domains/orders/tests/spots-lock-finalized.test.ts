import { test, afterAll } from 'vitest'
import assert from 'node:assert/strict'
import request from 'supertest'
import pool from '#pool'
import { mockSessions, restoreSessions, asAdmin } from '#shared/testing/session.ts'
import { TEST_ACTOR } from '#shared/testing/actor.ts'
import { inPinnedTransaction } from '#shared/testing/pinned-pool.ts'
import { aUser, anOrder } from '#shared/testing/builders/index.ts'
import { LOCKS } from '#shared/testing/locks.ts'

await mockSessions()
const { default: app } = await import('#app')

afterAll(async () => {
  restoreSessions()
  await pool.end()
})

test('lock and unlock are refused with 409 once the order is finalized', async () => {
  await inPinnedTransaction(
    async (client) => {
      const order = await anOrder(client, await aUser(client), { direction: 'purchase' })
        .withLots(1)
        .withSpots()
        .withTotals({ total: 100 })
      await client.query('UPDATE orders.orders SET spots_locked = true WHERE id = $1', [order.id])
      await asAdmin(TEST_ACTOR, async () => {
        for (const lock of [false, true]) {
          const res = await request(app).put(`/api/orders/${order.id}/spots`).send({ lock })
          assert.equal(res.status, 409, `lock=${lock} answered ${res.status}`)
        }
      })
      const { rows } = await client.query('SELECT spots_locked FROM orders.orders WHERE id = $1', [
        order.id,
      ])
      assert.equal(rows[0].spots_locked, true)
    },
    { actor: TEST_ACTOR.id, lock: LOCKS.ORDERS }
  )
})
