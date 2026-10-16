import { test, afterAll } from 'vitest'
import assert from 'node:assert/strict'
import type { PoolClient } from 'pg'
import request from 'supertest'
import pool from '#pool'
import { mockSessions, restoreSessions, asAdmin } from '#shared/testing/session.ts'
import { TEST_ACTOR } from '#shared/testing/actor.ts'
import { inPinnedTransaction } from '#shared/testing/pinned-pool.ts'
import { anUnknownId, aUser, anOrder, aShipment } from '#shared/testing/builders/index.ts'
import { LOCKS } from '#shared/testing/locks.ts'
import * as paymentsService from '#transactions/service.ts'
import * as orders from '#orders/service.ts'
import * as orderRead from '#orders/read.ts'

await mockSessions()
const { default: app } = await import('#app')

afterAll(async () => {
  restoreSessions()
  await pool.end()
})

const opts = {
  actor: TEST_ACTOR.id,
  lock: [LOCKS.ORDERS, LOCKS.ADDRESSES, LOCKS.USERS, LOCKS.FULFILLMENTS],
}
const REASON = 'customer changed their mind'

const aLabelledSale = async (c: PoolClient) => {
  const buyer = await aUser(c)
  const order = await anOrder(c, buyer, { direction: 'sale' }).withLots(1)
  const shipment = await aShipment(c, order)
  return { buyer, order, shipment }
}

const pay = async (c: PoolClient, buyer: { id: string }, order_id: string) => {
  const ref = `pi_${anUnknownId().slice(0, 24)}`
  const intent = { id: ref, status: 'succeeded', amount: 10000, amount_received: 10000 }
  await paymentsService.recordIntent(
    intent,
    { session_id: anUnknownId(), user_id: buyer.id },
    'sales_order_checkout',
    undefined,
    c
  )
  await paymentsService.attachOrder(ref, order_id, c)
  await paymentsService.updateFromProvider(intent, c)
}

const world = (c: PoolClient, order_id: string) => {
  const seen: string[] = []
  const cancelledWhen = async () =>
    (await c.query(`SELECT cancelled_at FROM orders.orders WHERE id = $1`, [order_id])).rows[0]
      .cancelled_at
  const w: typeof orders.SALE_CANCEL_WORLD = {
    openIntentRefFor: async () => 'pi_open',
    cancelIntent: async (ref: string) => {
      assert.ok(await cancelledWhen(), 'the intent was cancelled before the cancel committed')
      seen.push(`intent:${ref}`)
    },
    voidLabel: async (shipment_id: string) => {
      assert.ok(await cancelledWhen(), 'the label was voided before the cancel committed')
      seen.push(`void:${shipment_id}`)
      return undefined
    },
  }
  return { seen, world: w }
}

test('an unpaid sale cancels, stores the reason, then cancels the intent and voids the label', async () => {
  await inPinnedTransaction(
    async (c) => {
      const { order, shipment } = await aLabelledSale(c)
      const before = await orderRead.view(order.id)
      assert.ok(
        before!.actions.some((a) => a.name === 'cancel'),
        'cancel was not offered'
      )

      const { seen, world: w } = world(c, order.id)
      const view = await orders.cancelSale(order.id, { reason: REASON }, w)
      assert.ok(view.order.cancelled_at)
      assert.deepEqual(seen, ['intent:pi_open', `void:${shipment.id}`])
      const reasons = await c.query(
        `SELECT action, reason FROM orders.action_reasons WHERE order_id = $1`,
        [order.id]
      )
      assert.deepEqual(reasons.rows, [{ action: 'cancel', reason: REASON }])
    },
    { actor: opts.actor, lock: opts.lock }
  )
})

test('a carrier failure after commit leaves the sale cancelled', async () => {
  await inPinnedTransaction(
    async (c) => {
      const { order } = await aLabelledSale(c)
      const view = await orders.cancelSale(
        order.id,
        { reason: REASON },
        {
          openIntentRefFor: async () => null,
          cancelIntent: async () => undefined,
          voidLabel: async (): Promise<undefined> => {
            throw new Error('fedex is down')
          },
        }
      )
      assert.ok(view.order.cancelled_at)
    },
    { actor: opts.actor, lock: opts.lock }
  )
})

test('a paid sale is refused until a refund covers the charge; no write', async () => {
  await inPinnedTransaction(
    async (c) => {
      const { buyer, order } = await aLabelledSale(c)
      await pay(c, buyer, order.id)
      const before = await orderRead.view(order.id)
      assert.ok(
        !before!.actions.some((a) => a.name === 'cancel'),
        'cancel was offered on a paid sale'
      )
      const { seen, world: w } = world(c, order.id)
      await assert.rejects(
        orders.cancelSale(order.id, { reason: REASON }, w),
        /refund the money first/
      )
      assert.deepEqual(seen, [])
      const row = await c.query(`SELECT cancelled_at FROM orders.orders WHERE id = $1`, [order.id])
      assert.equal(row.rows[0].cancelled_at, null)
    },
    { actor: opts.actor, lock: opts.lock }
  )
})

test('a shipped sale and a cancel with no reason are refused', async () => {
  await inPinnedTransaction(
    async (c) => {
      const { order, shipment } = await aLabelledSale(c)
      const { world: w } = world(c, order.id)
      await assert.rejects(orders.cancelSale(order.id, {}, w), /reason/)
      await c.query(`UPDATE shipping.shipments SET shipped_at = now() WHERE id = $1`, [shipment.id])
      await assert.rejects(orders.cancelSale(order.id, { reason: REASON }, w), /has shipped/)
    },
    { actor: opts.actor, lock: opts.lock }
  )
})

test('http: a paid sale cancel answers 409', async () => {
  await inPinnedTransaction(
    async (c) => {
      const { buyer, order } = await aLabelledSale(c)
      await pay(c, buyer, order.id)
      await asAdmin(TEST_ACTOR, async () => {
        const res = await request(app)
          .post(`/api/orders/${order.id}/cancel`)
          .send({ reason: REASON })
        assert.equal(res.status, 409, res.text)
      })
    },
    { actor: opts.actor, lock: opts.lock }
  )
})
