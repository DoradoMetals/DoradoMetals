import { test, afterAll } from 'vitest'
import assert from 'node:assert/strict'
import type { PoolClient } from 'pg'
import request from 'supertest'
import pool from '#pool'
import { mockSessions, restoreSessions, asAdmin } from '#shared/testing/session.ts'
import { TEST_ACTOR } from '#shared/testing/actor.ts'
import { inPinnedTransaction } from '#shared/testing/pinned-pool.ts'
import { LOCKS } from '#shared/testing/locks.ts'
import { aUser, anAdmin, anOrder, aPayout } from '#shared/testing/builders/index.ts'
import * as orders from '#orders/service.ts'

await mockSessions()
const { default: app } = await import('#app')

afterAll(async () => {
  restoreSessions()
  await pool.end()
})

test('a purchase order walks pricing, funds and status, and the money facts agree', async () => {
  await inPinnedTransaction(
    async (c: PoolClient) => {
      const admin = await anAdmin(c)
      const seller = await aUser(c, { funds: 0 })
      const order = await anOrder(c, seller, { direction: 'purchase', status: 'In Transit' })
        .withLots(2, { metal_id: 'Gold', pre_melt: 10, purity: 0.925 })
        .withSpots({ bid: 2400, ask: 2450 })
        .withTotals({})
      await aPayout(c, seller, { method: 'DORADO_ACCOUNT', order })
      await c.query(`UPDATE orders.orders SET spots_locked = true WHERE id = $1`, [order.id])
      await orders.retierPremiums(order.id, c)

      const before = await asAdmin(admin, () => request(app).get(`/api/orders/${order.id}/lots`))
      assert.equal(before.status, 200, before.text)
      for (const line of before.body) {
        const confirmed = await asAdmin(admin, () =>
          request(app).patch(`/api/orders/lots/${line.id}`).send({ confirmed: true })
        )
        assert.equal(confirmed.status, 200, confirmed.text)
      }

      const priced = await asAdmin(admin, () =>
        request(app).post(`/api/orders/${order.id}/finalize`)
      )
      assert.equal(priced.status, 200, priced.text)
      assert.ok(priced.body.order.spots_locked, 'finalize did not lock the spots')
      const total = Number(priced.body.totals?.total)
      assert.ok(total > 0, 'finalize wrote no positive total')

      for (const line of priced.body.lots) {
        assert.equal(line.payable, Number(line.lot.content) * Number(line.premium))
        assert.equal(line.line_total, Number(line.price))
      }

      const actions = priced.body.actions
      assert.equal(actions.finalize, false)
      assert.equal(actions.edit_lots, false)
      assert.equal(actions.supply, false)
      assert.equal(actions.add_funds, true, 'a DORADO_ACCOUNT payout with a total is creditable')
      assert.deepEqual(actions.statuses, ['Received', 'Cancelled'])

      const funded = await asAdmin(admin, () =>
        request(app).post(`/api/orders/${order.id}/add_funds`)
      )
      assert.equal(funded.status, 200, funded.text)
      assert.equal(
        funded.body.actions.add_funds,
        false,
        'the credit was paid and the action is still offered (MP F4)'
      )

      const {
        rows: [balance],
      } = await c.query(`SELECT dorado_funds FROM auth.users WHERE id = $1`, [seller.id])
      assert.equal(
        Number(balance.dorado_funds),
        total,
        "the customer's balance does not equal the priced total"
      )
      const {
        rows: [entry],
      } = await c.query(
        `SELECT type, amount, order_id FROM payments.ledger
        WHERE user_id = $1 ORDER BY created_at DESC LIMIT 1`,
        [seller.id]
      )
      assert.equal(entry.type, 'Credit')
      assert.equal(Number(entry.amount), total, 'the ledger entry does not match what was credited')
      assert.equal(entry.order_id, order.id)

      for (const status of ['Received', 'In Transit']) {
        const moved = await asAdmin(admin, () =>
          request(app).patch(`/api/orders/${order.id}`).send({ status })
        )
        assert.equal(moved.status, 200, moved.text)
        assert.equal(moved.body.order.status, status)
        if (status === 'Received') {
          assert.deepEqual(moved.body.actions.statuses, [
            'Payment Processing',
            'In Transit',
            'Cancelled',
          ])
        }
      }

      const cancelled = await asAdmin(admin, () =>
        request(app).patch(`/api/orders/${order.id}`).send({ status: 'Cancelled' })
      )
      assert.equal(cancelled.status, 200, cancelled.text)
      assert.equal(cancelled.body.order.status, 'Cancelled')
    },
    { actor: TEST_ACTOR.id, lock: [LOCKS.ORDERS, LOCKS.USERS] }
  )
})

test('finalize and add_funds refuse a sales order - purchase-only actions', async () => {
  await inPinnedTransaction(
    async (c: PoolClient) => {
      const admin = await anAdmin(c)
      const buyer = await aUser(c)
      const order = await anOrder(c, buyer, { direction: 'sale' }).withSpots()

      const priced = await asAdmin(admin, () =>
        request(app).post(`/api/orders/${order.id}/finalize`)
      )
      assert.equal(priced.status, 422, priced.text)

      const funded = await asAdmin(admin, () =>
        request(app).post(`/api/orders/${order.id}/add_funds`)
      )
      assert.equal(funded.status, 422, funded.text)
    },
    { actor: TEST_ACTOR.id, lock: LOCKS.ORDERS }
  )
})
