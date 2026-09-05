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
        AND (SELECT count(*) FROM orders.items i WHERE i.order_id = o.id) > 0
        AND EXISTS (SELECT 1 FROM orders.spots s WHERE s.order_id = o.id)
      ORDER BY o.created_at DESC
      LIMIT 1`
  )
  assert.ok(rows[0], 'dev has no purchase order with items, spots and a payout')
  order = rows[0]

  admin = TEST_ACTOR

  items = await outside<ItemFixture>(`SELECT id, quantity FROM orders.items WHERE order_id = $1`, [
    order.id,
  ])
  assert.ok(items.length > 0, 'the fixture order has no items')
})

afterAll(async () => {
  restoreSessions()
  await pool.end()
})

const poisonedClaiming = (pricePerItem: number) => ({
  finalize_pricing: true,
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

test("a clean finalize prices the order from the database's own rows", async () => {
  await inPinnedTransaction(
    async (client: PoolClient) => {
      await asAdmin(admin, async () => {
        const before = (
          await client.query(`SELECT status FROM orders.orders WHERE id = $1`, [order.id])
        ).rows[0]

        const res = await request(app).post(`/api/orders/${order.id}/finalize_pricing`).send({})
        assert.equal(res.status, 200, `answered ${res.status}: ${JSON.stringify(res.body)}`)

        const row = (
          await client.query(
            `SELECT t.total AS total_price, o.status, o.spots_locked
             FROM orders.orders o
             JOIN orders.transactions t ON t.order_id = o.id
            WHERE o.id = $1`,
            [order.id]
          )
        ).rows[0]
        assert.equal(
          row.status,
          before.status,
          'finalize_pricing moved the status - pipelines must not write labels'
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
          assert.equal(line.source, 'stored', "finalizing writes every line's price")
        }
      })
    },
    { actor: TEST_ACTOR.id, lock: ORDER_LOCK }
  )
})
