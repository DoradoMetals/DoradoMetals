import { test, afterAll } from 'vitest'
import assert from 'node:assert/strict'
import type { PoolClient } from 'pg'
import request from 'supertest'
import pool from '#pool'
import { mockSessions, restoreSessions, asAdmin } from '#shared/testing/session.ts'
import { TEST_ACTOR } from '#shared/testing/actor.ts'
import { inPinnedTransaction } from '#shared/testing/pinned-pool.ts'
import { LOCKS } from '#shared/testing/locks.ts'
import { aUser, anOrder, anUnknownId } from '#shared/testing/builders/index.ts'
import * as lots from '#db/inventory/lots/repo.ts'

await mockSessions()
const { default: app } = await import('#app')

afterAll(async () => {
  restoreSessions()
  await pool.end()
})

const inRefining = <T>(fn: (c: PoolClient) => Promise<T>) =>
  inPinnedTransaction(fn, { actor: TEST_ACTOR.id, lock: LOCKS.ORDERS })

const refinerId = async (c: PoolClient): Promise<string> => {
  const { rows } = await c.query<{ id: string }>('SELECT id FROM refiners.refiners LIMIT 1')
  assert.ok(rows[0], 'the test database has no refiner')
  return rows[0].id
}

const deliveredPurchaseOrder = async (c: PoolClient, n = 1) => {
  const order = await anOrder(c, await aUser(c), { direction: 'purchase' })
    .withLots(n, { metal_id: 'Gold', pre_melt: 10, purity: 0.9, unit: 't oz' })
    .withFulfillment()
  await c.query(
    `UPDATE shipping.shipments s
        SET shipping_status = 'Delivered', delivered_at = now()
       FROM fulfillments.shipments fs
       JOIN fulfillments.fulfillments f ON f.id = fs.fulfillment_id
      WHERE fs.shipment_id = s.id AND f.order_id = $1`,
    [order.id]
  )
  return order
}

test('a batch by lot_ids takes what is on hand, and a lot that is not is BLOCKED by name', async () => {
  await inRefining(async (c) => {
    await asAdmin(TEST_ACTOR, async () => {
      const refiner_id = await refinerId(c)
      const onHand = await lots.create({ metal_id: 'Gold', pre_melt: 5, purity: 0.9 }, c)
      const sold = await anOrder(c, await aUser(c), { direction: 'sale' }).withLots(1)

      const res = await request(app)
        .post('/api/refining/orders/batch')
        .send({ refiner_id, lot_ids: [onHand.id] })
      assert.equal(res.status, 201, res.text)
      assert.equal(res.body.taken, 1)
      assert.deepEqual(res.body.skipped, [])
      assert.equal(res.body.order.lots.length, 1)
      assert.equal(res.body.order.direction, 'sell')
      assert.equal(res.body.order.settlement_type, 'pooled', 'a fresh batch order defaults pooled')

      const refused = await request(app)
        .post('/api/refining/orders/batch')
        .send({ refiner_id, lot_ids: [sold.lots[0]!.lot_id] })
      assert.equal(refused.status, 422, refused.text)
      assert.match(refused.body?.error?.message ?? '', /not on hand/)

      const again = await request(app)
        .post('/api/refining/orders/batch')
        .send({ refiner_id, lot_ids: [onHand.id] })
      assert.equal(again.status, 409, again.text)
      assert.match(
        again.body?.error?.message ?? '',
        /already on another refiner order/,
        'an already-batched lot named explicitly is blocked by that reason, not "not on hand"'
      )
    })
  })
})

test('a batch by order_ids expands to on-hand lots, pools onto the same draft, and skips what is already taken', async () => {
  await inRefining(async (c) => {
    await asAdmin(TEST_ACTOR, async () => {
      const refiner_id = await refinerId(c)
      const first = await deliveredPurchaseOrder(c, 1)
      const second = await deliveredPurchaseOrder(c, 1)

      const res = await request(app)
        .post('/api/refining/orders/batch')
        .send({ refiner_id, order_ids: [first.id] })
      assert.equal(res.status, 201, res.text)
      assert.equal(res.body.taken, 1)
      assert.deepEqual(res.body.skipped, [])

      const again = await request(app)
        .post('/api/refining/orders/batch')
        .send({ refiner_id, order_ids: [first.id, second.id] })
      assert.equal(again.status, 201, again.text)
      assert.equal(
        again.body.order.id,
        res.body.order.id,
        'a second batch pools onto the one open sell order for the refiner'
      )
      assert.equal(again.body.taken, 1, "the second order's lot is the only fresh one")
      assert.equal(again.body.skipped.length, 1, "the first order's lot is already batched")
      assert.equal(again.body.skipped[0].lot_id, first.lots[0]!.lot_id)
      assert.equal(again.body.order.lots.length, 2, 'the draft now holds both refiner lots')
    })
  })
})

test('a batch names exactly one of lot_ids or order_ids', async () => {
  await inRefining(async (c) => {
    await asAdmin(TEST_ACTOR, async () => {
      const refiner_id = await refinerId(c)
      const neither = await request(app).post('/api/refining/orders/batch').send({ refiner_id })
      assert.equal(neither.status, 422, neither.text)
      assert.match(neither.body?.error?.message ?? '', /exactly one of/)

      const both = await request(app)
        .post('/api/refining/orders/batch')
        .send({ refiner_id, lot_ids: [anUnknownId()], order_ids: [anUnknownId()] })
      assert.equal(both.status, 422, both.text)
      assert.match(both.body?.error?.message ?? '', /exactly one of/)
    })
  })
})

test('a batch names a refiner that exists', async () => {
  await inRefining(async () => {
    await asAdmin(TEST_ACTOR, async () => {
      const res = await request(app)
        .post('/api/refining/orders/batch')
        .send({ refiner_id: anUnknownId(), lot_ids: [anUnknownId()] })
      assert.equal(res.status, 404, res.text)
    })
  })
})

test('a batch by order_ids that names no lots still finds or opens the draft', async () => {
  await inRefining(async (c) => {
    await asAdmin(TEST_ACTOR, async () => {
      const refiner_id = await refinerId(c)
      const empty = await anOrder(c, await aUser(c), { direction: 'purchase' })

      const res = await request(app)
        .post('/api/refining/orders/batch')
        .send({ refiner_id, order_ids: [empty.id] })
      assert.equal(res.status, 201, res.text)
      assert.equal(res.body.taken, 0)
      assert.deepEqual(res.body.skipped, [])
      assert.deepEqual(res.body.order.lots, [])
    })
  })
})
