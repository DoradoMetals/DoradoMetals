import { test, afterAll } from 'vitest'
import assert from 'node:assert/strict'
import type { PoolClient } from 'pg'
import request from 'supertest'
import pool from '#pool'
import { mockSessions, restoreSessions, asAdmin } from '#shared/testing/session.ts'
import { TEST_ACTOR } from '#shared/testing/actor.ts'
import { inPinnedTransaction } from '#shared/testing/pinned-pool.ts'
import { LOCKS } from '#shared/testing/locks.ts'
import { aUser, anOrder, aRefiningOrder } from '#shared/testing/builders/index.ts'
import * as transfers from '#db/payments/transfers/repo.ts'
import type { BuiltOrder } from '#shared/testing/builders/orders.ts'

await mockSessions()
const { default: app } = await import('#app')

const admin = TEST_ACTOR
const LOCK = [LOCKS.ORDERS, LOCKS.FULFILLMENTS, LOCKS.ADDRESSES, LOCKS.USERS]

afterAll(async () => {
  restoreSessions()
  await pool.end()
})

async function shipmentIdFor(c: PoolClient, order_id: string): Promise<string> {
  const { rows } = await c.query<{ id: string }>(
    `SELECT s.id FROM shipping.shipments s
       JOIN fulfillments.shipments fs ON fs.shipment_id = s.id
       JOIN fulfillments.fulfillments f ON f.id = fs.fulfillment_id
      WHERE f.order_id = $1`,
    [order_id]
  )
  return rows[0]!.id
}

async function markDelivered(c: PoolClient, order_id: string): Promise<void> {
  const shipment_id = await shipmentIdFor(c, order_id)
  await c.query(
    `UPDATE shipping.shipments SET shipping_status = 'Delivered', delivered_at = now()
      WHERE id = $1`,
    [shipment_id]
  )
}

async function markShipped(c: PoolClient, order_id: string): Promise<void> {
  const shipment_id = await shipmentIdFor(c, order_id)
  await c.query(
    `UPDATE shipping.shipments SET shipped_at = now(), tracking_number = '794600000001'
      WHERE id = $1`,
    [shipment_id]
  )
}

async function markPaid(c: PoolClient, order_id: string, user_id: string): Promise<void> {
  await c.query(
    `INSERT INTO payments.intents (type, status, amount_expected, user_id, order_id)
     VALUES ('order', 'succeeded', 1, $1, $2)`,
    [user_id, order_id]
  )
}

async function finalizeOrder(c: PoolClient, order_id: string, total = 1000): Promise<void> {
  await c.query(
    `INSERT INTO orders.transactions (order_id, total) VALUES ($1, $2)
       ON CONFLICT (order_id) DO UPDATE SET total = EXCLUDED.total`,
    [order_id, total]
  )
  await c.query(`UPDATE orders.orders SET spots_locked = true WHERE id = $1`, [order_id])
}

async function sendPayout(c: PoolClient, order: BuiltOrder): Promise<void> {
  await transfers.create(
    {
      order_id: order.id,
      refining_order_id: null,
      kind: 'payout',
      rail: 'ACH',
      state: 'Sent',
      amount: 1000,
      counterparty_user_id: order.user_id,
      details_id: null,
      bank_link_id: null,
      provider: null,
      provider_ref: null,
      reference: `PO-${order.number}`,
      idempotency_key: null,
      override_reason: null,
    },
    c
  )
}

async function assertState(order_id: string, expected: string): Promise<void> {
  const res = await asAdmin(admin, () => request(app).get(`/api/orders/${order_id}`))
  assert.equal(res.status, 200, res.text)
  assert.equal(res.body.state, expected, JSON.stringify(res.body))
}

test('purchase: cancelled wins over everything else', async () => {
  await inPinnedTransaction(
    async (c: PoolClient) => {
      const user = await aUser(c)
      const order = await anOrder(c, user, { direction: 'purchase' })
        .withLots(1)
        .withFulfillment()
      await c.query(`UPDATE orders.orders SET cancelled_at = now() WHERE id = $1`, [order.id])
      await assertState(order.id, 'Cancelled')
    },
    { actor: TEST_ACTOR.id, lock: LOCK }
  )
})

test('purchase: a fresh order with an unreceived parcel awaits receipt', async () => {
  await inPinnedTransaction(
    async (c: PoolClient) => {
      const user = await aUser(c)
      const order = await anOrder(c, user, { direction: 'purchase' })
        .withLots(1)
        .withFulfillment()
      await assertState(order.id, 'Awaiting Receipt')
    },
    { actor: TEST_ACTOR.id, lock: LOCK }
  )
})

test('purchase: metal at the refiner, unsettled', async () => {
  await inPinnedTransaction(
    async (c: PoolClient) => {
      const user = await aUser(c)
      const order = await anOrder(c, user, { direction: 'purchase' })
        .withLots(1)
        .withFulfillment()
      await markDelivered(c, order.id)
      const engagement = await aRefiningOrder(c, order, { direction: 'sell' })
      await c.query(`UPDATE refining.orders SET sent_at = now() WHERE id = $1`, [engagement.id])
      await assertState(order.id, 'At Refiner')
    },
    { actor: TEST_ACTOR.id, lock: LOCK }
  )
})

test('purchase: received and not yet finalized awaits payout', async () => {
  await inPinnedTransaction(
    async (c: PoolClient) => {
      const user = await aUser(c)
      const order = await anOrder(c, user, { direction: 'purchase' })
        .withLots(1)
        .withFulfillment()
      await markDelivered(c, order.id)
      await assertState(order.id, 'Awaiting Payout')
    },
    { actor: TEST_ACTOR.id, lock: LOCK }
  )
})

test('purchase: finalized with no payout sent is ready to pay', async () => {
  await inPinnedTransaction(
    async (c: PoolClient) => {
      const user = await aUser(c)
      const order = await anOrder(c, user, { direction: 'purchase' })
        .withLots(1)
        .withFulfillment()
      await markDelivered(c, order.id)
      await finalizeOrder(c, order.id)
      await assertState(order.id, 'Ready to Pay')
    },
    { actor: TEST_ACTOR.id, lock: LOCK }
  )
})

test('purchase: a sent payout completes the order', async () => {
  await inPinnedTransaction(
    async (c: PoolClient) => {
      const user = await aUser(c)
      const order = await anOrder(c, user, { direction: 'purchase' })
        .withLots(1)
        .withFulfillment()
      await markDelivered(c, order.id)
      await finalizeOrder(c, order.id)
      await sendPayout(c, order)
      await assertState(order.id, 'Completed')
    },
    { actor: TEST_ACTOR.id, lock: LOCK }
  )
})

test('purchase OUT OF ORDER: paid before the refiner settles still reads At Refiner, not Completed', async () => {
  await inPinnedTransaction(
    async (c: PoolClient) => {
      const user = await aUser(c)
      const order = await anOrder(c, user, { direction: 'purchase' })
        .withLots(1)
        .withFulfillment()
      await markDelivered(c, order.id)
      const engagement = await aRefiningOrder(c, order, { direction: 'sell' })
      await c.query(`UPDATE refining.orders SET sent_at = now() WHERE id = $1`, [engagement.id])
      await finalizeOrder(c, order.id)
      await sendPayout(c, order)
      await assertState(order.id, 'At Refiner')
    },
    { actor: TEST_ACTOR.id, lock: LOCK }
  )
})

test('sale: cancelled wins over everything else', async () => {
  await inPinnedTransaction(
    async (c: PoolClient) => {
      const user = await aUser(c)
      const order = await anOrder(c, user, { direction: 'sale' })
        .withLots(1)
        .withFulfillment('DROPSHIP')
      await c.query(`UPDATE orders.orders SET cancelled_at = now() WHERE id = $1`, [order.id])
      await assertState(order.id, 'Cancelled')
    },
    { actor: TEST_ACTOR.id, lock: LOCK }
  )
})

test('sale: a fresh, unpaid order awaits payment', async () => {
  await inPinnedTransaction(
    async (c: PoolClient) => {
      const user = await aUser(c)
      const order = await anOrder(c, user, { direction: 'sale' })
        .withLots(1)
        .withFulfillment('DROPSHIP')
      await assertState(order.id, 'Awaiting Payment')
    },
    { actor: TEST_ACTOR.id, lock: LOCK }
  )
})

test('sale: paid and not yet shipped is preparing', async () => {
  await inPinnedTransaction(
    async (c: PoolClient) => {
      const user = await aUser(c)
      const order = await anOrder(c, user, { direction: 'sale' })
        .withLots(1)
        .withFulfillment('DROPSHIP')
      await markPaid(c, order.id, user.id)
      await assertState(order.id, 'Preparing')
    },
    { actor: TEST_ACTOR.id, lock: LOCK }
  )
})

test('sale: paid and shipped is in transit', async () => {
  await inPinnedTransaction(
    async (c: PoolClient) => {
      const user = await aUser(c)
      const order = await anOrder(c, user, { direction: 'sale' })
        .withLots(1)
        .withFulfillment('DROPSHIP')
      await markPaid(c, order.id, user.id)
      await markShipped(c, order.id)
      await assertState(order.id, 'In Transit')
    },
    { actor: TEST_ACTOR.id, lock: LOCK }
  )
})

test('sale: paid and delivered completes the order', async () => {
  await inPinnedTransaction(
    async (c: PoolClient) => {
      const user = await aUser(c)
      const order = await anOrder(c, user, { direction: 'sale' })
        .withLots(1)
        .withFulfillment('DROPSHIP')
      await markPaid(c, order.id, user.id)
      await markDelivered(c, order.id)
      await assertState(order.id, 'Completed')
    },
    { actor: TEST_ACTOR.id, lock: LOCK }
  )
})

test('sale OUT OF ORDER: delivered before the charge settles still reads Awaiting Payment', async () => {
  await inPinnedTransaction(
    async (c: PoolClient) => {
      const user = await aUser(c)
      const order = await anOrder(c, user, { direction: 'sale' })
        .withLots(1)
        .withFulfillment('DROPSHIP')
      await markDelivered(c, order.id)
      await assertState(order.id, 'Awaiting Payment')
    },
    { actor: TEST_ACTOR.id, lock: LOCK }
  )
})

test('send_payment names the unsettled lots, and drops the reason once every one settles', async () => {
  await inPinnedTransaction(
    async (c: PoolClient) => {
      const user = await aUser(c)
      const order = await anOrder(c, user, { direction: 'purchase' })
        .withLots(1)
        .withFulfillment()
      await markDelivered(c, order.id)
      await finalizeOrder(c, order.id)
      const engagement = await aRefiningOrder(c, order, { direction: 'sell' })
      await c.query(`UPDATE refining.orders SET sent_at = now() WHERE id = $1`, [engagement.id])

      const findSendPayment = (body: { actions: { name: string; confirm: string | null }[] }) =>
        body.actions.find((a) => a.name === 'send_payment')

      const unsettled = await asAdmin(admin, () => request(app).get(`/api/orders/${order.id}`))
      assert.equal(unsettled.status, 200, unsettled.text)
      assert.equal(
        findSendPayment(unsettled.body)?.confirm,
        'Refiner has not settled 1 of 1 lots',
        'an unsettled lot did not name itself in the confirm reason'
      )

      await c.query(
        `UPDATE refining.lots SET settled_at = now(), premium = 0.9 WHERE refining_order_id = $1`,
        [engagement.id]
      )

      const settled = await asAdmin(admin, () => request(app).get(`/api/orders/${order.id}`))
      assert.equal(settled.status, 200, settled.text)
      assert.equal(
        findSendPayment(settled.body)?.confirm,
        null,
        'a fully-settled order still warned about the refiner'
      )
    },
    { actor: TEST_ACTOR.id, lock: LOCK }
  )
})
