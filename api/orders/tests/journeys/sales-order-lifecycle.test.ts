import { test, afterAll } from 'vitest'
import assert from 'node:assert/strict'
import type { PoolClient } from 'pg'
import request from 'supertest'
import pool from '#pool'
import { mockSessions, restoreSessions, asAdmin } from '#shared/testing/session.ts'
import { TEST_ACTOR } from '#shared/testing/actor.ts'
import { inPinnedTransaction } from '#shared/testing/pinned-pool.ts'
import { LOCKS } from '#shared/testing/locks.ts'
import {
  aUser,
  anAdmin,
  anOrder,
  aProduct,
  aPaymentIntent,
} from '#shared/testing/builders/index.ts'

await mockSessions()
const { default: app } = await import('#app')

afterAll(async () => {
  restoreSessions()
  await pool.end()
})

test('a sales order is born Pending, moves to Preparing and Shipped, and cancels', async () => {
  await inPinnedTransaction(
    async (c: PoolClient) => {
      const admin = await anAdmin(c)
      const buyer = await aUser(c)
      const product = await aProduct(c, { metal_id: 'Gold', content: 1, ask_premium: 75 })
      const order = await anOrder(c, buyer, { direction: 'sale', status: 'Pending' })
        .withBullion(product, 1)
        .withTotals({ total: 2475 })
      const intent = await aPaymentIntent(c, buyer, {
        type: 'customer',
        amount_expected: 2475,
        order,
      })

      const read = await asAdmin(admin, () => request(app).get(`/api/orders?direction=sale`))
      assert.equal(read.status, 200, read.text)
      const row = read.body.find((o: { id: string }) => o.id === order.id)
      assert.ok(row, 'the built sale did not appear in the admin list')
      assert.equal(row.status, 'Pending', 'a freshly built sale should be Pending')

      for (const status of ['Preparing', 'Shipped']) {
        const moved = await asAdmin(admin, () =>
          request(app).patch(`/api/orders/${order.id}`).send({ status })
        )
        assert.equal(moved.status, 200, moved.text)
        assert.equal(moved.body.order.status, status)
      }

      const {
        rows: [stillTheSameIntent],
      } = await c.query(`SELECT amount_expected FROM payments.intents WHERE id = $1`, [intent.id])
      assert.equal(
        Number(stillTheSameIntent.amount_expected),
        2475,
        "a status transition changed the intent's amount"
      )

      const cancelled = await asAdmin(admin, () =>
        request(app).patch(`/api/orders/${order.id}`).send({ status: 'Cancelled' })
      )
      assert.equal(cancelled.status, 200, cancelled.text)
      assert.equal(cancelled.body.order.status, 'Cancelled')
    },
    { actor: TEST_ACTOR.id, lock: LOCKS.ORDERS }
  )
})

test('the real cancel endpoint is purchase-only: a sales order is refused, not charged', async () => {
  await inPinnedTransaction(
    async (c: PoolClient) => {
      const admin = await anAdmin(c)
      const buyer = await aUser(c)
      const order = await anOrder(c, buyer, { direction: 'sale' })

      const cancelled = await asAdmin(admin, () =>
        request(app).post(`/api/orders/${order.id}/cancel`).send({
          carrier_service_id: '00000000-0000-4000-8000-000000000000',
          package_id: '00000000-0000-4000-8000-000000000000',
        })
      )
      assert.equal(cancelled.status, 422, cancelled.text)
    },
    { actor: TEST_ACTOR.id, lock: LOCKS.ORDERS }
  )
})
