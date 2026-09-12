import { test, afterAll, beforeAll } from 'vitest'
import assert from 'node:assert/strict'
import type { PoolClient } from 'pg'
import request from 'supertest'
import pool from '#pool'
import { mockSessions, restoreSessions, as, asAdmin } from '#shared/testing/session.ts'
import { TEST_ACTOR } from '#shared/testing/actor.ts'
import { inPinnedTransaction, outside } from '#shared/testing/pinned-pool.ts'
import * as pricing from '#pricing/index.ts'
import * as orderRead from '#orders/read.ts'
import { LOCKS } from '#shared/testing/locks.ts'

const ORDER_LOCK = LOCKS.ORDERS

await mockSessions()
const { default: app } = await import('#app')

type UserFixture = { id: string; name: string | null; email: string | null }
type OrderFixture = { id: string; user_id: string; total_price: string | null }
type ItemFixture = { id: string; quantity: string | number | null }

let order: OrderFixture
let admin: UserFixture
let items: ItemFixture[]

beforeAll(async () => {
  const rows = await outside<OrderFixture>(
    `SELECT o.id, o.user_id, t.total AS total_price
       FROM orders.orders o
       JOIN orders.transactions t ON t.order_id = o.id
      WHERE o.direction = 'purchase' AND o.user_id IS NOT NULL
        AND t.payout_fee IS NOT NULL
        AND (SELECT count(*) FROM orders.lots l WHERE l.order_id = o.id) > 0
        AND EXISTS (SELECT 1 FROM orders.spots s WHERE s.order_id = o.id)
      ORDER BY o.created_at DESC
      LIMIT 1`
  )
  assert.ok(rows[0], 'dev has no purchase order with items, spots and a payout')
  order = rows[0]

  admin = TEST_ACTOR

  items = await outside<ItemFixture>(
    `SELECT ol.id, li.quantity FROM orders.lots ol JOIN inventory.lots li ON li.id = ol.lot_id WHERE ol.order_id = $1`,
    [order.id]
  )
  assert.ok(items.length > 0, 'the fixture order has no items')
})

afterAll(async () => {
  restoreSessions()
  await pool.end()
})

const poisonedClaiming = (pricePerItem: number) => ({
  finalize: true,
  purchase_order: {
    id: order.id,
    spots_locked: true,
    order_items: items.map((i) => ({
      id: i.id,
      item_type: 'scrap',
      price: pricePerItem,
      quantity: Number(i.quantity) || 1,
      scrap: { metal_id: 'Gold', content: 0, bid_premium: 0 },
    })),
    shipment: { shipping_charge: 0 },
    payout: { cost: 0 },
  },
  order_spots: [],
  spot_prices: [],
})

test('a document claiming its own prices is refused by name, and the money does not move', async () => {
  await inPinnedTransaction(
    async (client: PoolClient) => {
      await asAdmin(admin, async () => {
        for (const claimed of [1, 100000]) {
          const res = await request(app)
            .patch(`/api/orders/${order.id}`)
            .send(poisonedClaiming(claimed))

          assert.equal(res.status, 400, `the poisoned document was answered ${res.status}`)
          assert.match(
            res.body?.error?.message ?? '',
            /purchase_order/,
            'the refusal does not name the field it refused'
          )
        }

        const { rows } = await client.query(
          `SELECT total AS total_price FROM orders.transactions WHERE order_id = $1`,
          [order.id]
        )
        assert.equal(
          rows[0].total_price === null ? null : Number(rows[0].total_price),
          order.total_price === null ? null : Number(order.total_price),
          "a refused document still moved the order's total"
        )
      })
    },
    { actor: TEST_ACTOR.id, lock: ORDER_LOCK }
  )
})

const confirmEveryLine = async (client: PoolClient) => {
  await client.query(
    `UPDATE inventory.lots li SET confirmed_at = now()
       FROM orders.lots ol WHERE ol.lot_id = li.id AND ol.order_id = $1`,
    [order.id]
  )
}

test('finalizing an order with an unconfirmed line still succeeds, but the drawer was warned first', async () => {
  await inPinnedTransaction(
    async (client: PoolClient) => {
      await asAdmin(admin, async () => {
        await client.query(
          `UPDATE inventory.lots li SET confirmed_at = NULL
             FROM orders.lots ol WHERE ol.id = $1 AND ol.lot_id = li.id`,
          [items[0]!.id]
        )
        const view = await orderRead.view(order.id)
        const finalizeAction = view?.actions.find((a) => a.name === 'finalize')
        assert.ok(finalizeAction, 'the action was not offered at all')
        assert.match(
          finalizeAction!.confirm ?? '',
          /not confirmed/,
          'an unconfirmed lot should carry a confirm reason, not a block'
        )

        const res = await request(app).post(`/api/orders/${order.id}/finalize`).send({})
        assert.equal(res.status, 200, `answered ${res.status}: ${JSON.stringify(res.body)}`)
        assert.equal(
          res.body.order.spots_locked,
          true,
          'confirm is a warning, not a gate - finalize should still have run'
        )
      })
    },
    { actor: TEST_ACTOR.id, lock: ORDER_LOCK }
  )
})

test("a clean finalize prices the order from the database's own rows", async () => {
  await inPinnedTransaction(
    async (client: PoolClient) => {
      await asAdmin(admin, async () => {
        await confirmEveryLine(client)
        const before = (
          await client.query(`SELECT cancelled_at FROM orders.orders WHERE id = $1`, [order.id])
        ).rows[0]

        const res = await request(app).post(`/api/orders/${order.id}/finalize`).send({})
        assert.equal(res.status, 200, `answered ${res.status}: ${JSON.stringify(res.body)}`)

        const row = (
          await client.query(
            `SELECT t.total AS total_price, o.cancelled_at, o.spots_locked
             FROM orders.orders o
             JOIN orders.transactions t ON t.order_id = o.id
            WHERE o.id = $1`,
            [order.id]
          )
        ).rows[0]
        assert.equal(
          row.cancelled_at,
          before.cancelled_at,
          'finalize moved an unrelated fact - pipelines must not write facts beside their own'
        )
        assert.equal(row.spots_locked, true, 'finalizing pins the spots')

        const priced = await orderRead.view(order.id)
        assert.ok(priced, `the API could not read order ${order.id} back after pricing it`)

        assert.equal(
          typeof priced!.payout?.cost,
          'number',
          'the order view carries no numeric payout.cost - the total would be NaN'
        )

        const expected = await pricing.priceOrder(order.id)

        assert.equal(
          Number(row.total_price).toFixed(2),
          expected.total.toFixed(2),
          "the stored total does not derive from the database's own rows"
        )
        for (const line of expected.items) {
          assert.ok(
            Number.isFinite(line.unit_price),
            "finalizing prices every line from the database's own rows"
          )
        }
      })
    },
    { actor: TEST_ACTOR.id, lock: ORDER_LOCK }
  )
})

test('finalizing refreshes the frozen ask alongside the bid', async () => {
  await inPinnedTransaction(
    async (client: PoolClient) => {
      await asAdmin(admin, async () => {
        await confirmEveryLine(client)
        await client.query(`UPDATE orders.orders SET spots_locked = false WHERE id = $1`, [
          order.id,
        ])
        await client.query(`UPDATE spots.spots SET ask = ask + 111.11, bid = bid + 77.77`)

        const res = await request(app).post(`/api/orders/${order.id}/finalize`).send({})
        assert.equal(res.status, 200, `answered ${res.status}: ${JSON.stringify(res.body)}`)

        const { rows } = await client.query(
          `SELECT os.metal_id, os.ask, os.bid, s.ask AS feed_ask, s.bid AS feed_bid
             FROM orders.spots os
             JOIN spots.spots s ON s.metal_id = os.metal_id
            WHERE os.order_id = $1`,
          [order.id]
        )
        assert.ok(rows.length > 0, 'the fixture order froze no spots')
        for (const row of rows) {
          assert.equal(Number(row.bid), Number(row.feed_bid), `${row.metal_id}: the bid is stale`)
          assert.equal(
            Number(row.ask),
            Number(row.feed_ask),
            `${row.metal_id}: the ask is a different day from the bid`
          )
        }
      })
    },
    { actor: TEST_ACTOR.id, lock: ORDER_LOCK }
  )
})
