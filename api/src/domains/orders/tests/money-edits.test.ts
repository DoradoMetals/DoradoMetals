import { test, afterAll } from 'vitest'
import assert from 'node:assert/strict'
import type { PoolClient } from 'pg'
import request from 'supertest'
import pool from '#pool'
import { mockSessions, restoreSessions, as, asAdmin } from '#shared/testing/session.ts'
import { TEST_ACTOR } from '#shared/testing/actor.ts'
import { inPinnedTransaction } from '#shared/testing/pinned-pool.ts'
import { LOCKS } from '#shared/testing/locks.ts'
import { aUser, anOrder, aShipment, aPayout } from '#shared/testing/builders/index.ts'

await mockSessions()
const { default: app } = await import('#app')

type UserFixture = { id: string; name: string | null; email: string | null }
type ShipmentFixture = { id: string; order_id: string }
type PayoutFixture = { id: string; order_id: string }

const admin: UserFixture = TEST_ACTOR

const money = async (c: PoolClient) => {
  const customer = await aUser(c)
  const order = await anOrder(c, customer, { direction: 'purchase' })
    .withLots(1)
    .withTotals({ total: 1000 })
  const parcel = await aShipment(c, order)
  const payout = await aPayout(c, customer, { order })
  return {
    shipment: { id: parcel.id, order_id: order.id },
    payout: { id: payout.id, order_id: order.id },
  }
}

afterAll(async () => {
  restoreSessions()
  await pool.end()
})

test("charge writes net_charge on the order's shipment", async () => {
  await inPinnedTransaction(
    async (client: PoolClient) => {
      const { shipment } = await money(client)
      await asAdmin(admin, async () => {
        const res = await request(app)
          .post(`/api/shipments/${shipment.id}/charge`)
          .send({ shipping_charge: 45.67 })

        assert.equal(res.status, 200, `answered ${res.status}: ${JSON.stringify(res.body)}`)

        const { rows } = await client.query(`SELECT cost FROM shipping.shipments WHERE id = $1`, [
          shipment.id,
        ])
        assert.equal(Number(rows[0].cost), 45.67, 'the charge did not change')
      })
    },
    { actor: TEST_ACTOR.id, lock: [LOCKS.ORDERS, LOCKS.FULFILLMENTS] }
  )
})

test("actual_cost lands on the shipment's order", async () => {
  await inPinnedTransaction(
    async (client: PoolClient) => {
      const { shipment } = await money(client)
      await asAdmin(admin, async () => {
        const res = await request(app)
          .post(`/api/shipments/${shipment.id}/actual_cost`)
          .send({ shipping_actual: 12.34 })

        assert.equal(res.status, 200, `answered ${res.status}: ${JSON.stringify(res.body)}`)

        const { rows } = await client.query(
          `SELECT shipping_fee_actual FROM orders.transactions WHERE order_id = $1`,
          [shipment.order_id]
        )
        assert.equal(Number(rows[0].shipping_fee_actual), 12.34, 'the actual cost did not land')
      })
    },
    { actor: TEST_ACTOR.id, lock: [LOCKS.ORDERS, LOCKS.FULFILLMENTS] }
  )
})

test("cost writes the payout's cost", async () => {
  await inPinnedTransaction(
    async (client: PoolClient) => {
      const { payout } = await money(client)
      await asAdmin(admin, async () => {
        const res = await request(app)
          .patch(`/api/payments/details/${payout.id}`)
          .send({ cost: 56.78 })

        assert.equal(res.status, 200, `answered ${res.status}: ${JSON.stringify(res.body)}`)

        const { rows } = await client.query(
          `SELECT payout_fee FROM orders.transactions WHERE order_id = $1`,
          [payout.order_id]
        )
        assert.ok(rows.length, 'no money row for that order')
        assert.equal(Number(rows[0].payout_fee), 56.78, 'cost did not change')
      })
    },
    { actor: TEST_ACTOR.id, lock: [LOCKS.ORDERS, LOCKS.FULFILLMENTS] }
  )
})

test("method writes the payout's method, and the response is the payout row", async () => {
  await inPinnedTransaction(
    async (client: PoolClient) => {
      const { payout } = await money(client)
      await asAdmin(admin, async () => {
        const res = await request(app)
          .patch(`/api/payments/details/${payout.id}`)
          .send({ method: 'ACH' })

        assert.equal(res.status, 200, `answered ${res.status}: ${JSON.stringify(res.body)}`)
        assert.equal(res.body.id, payout.id)
        assert.ok(!('routing_number' in res.body), 'the payout PATCH answered a routing number')
        assert.ok(!('account_number' in res.body), 'the payout PATCH answered an account number')

        const { rows } = await client.query(
          `SELECT m.type
           FROM payments.details d
           JOIN payments.methods m ON m.id = d.method_id
          WHERE d.id = $1`,
          [payout.id]
        )
        assert.equal(rows[0].type, 'ACH', 'the method did not change')
      })
    },
    { actor: TEST_ACTOR.id, lock: [LOCKS.ORDERS, LOCKS.FULFILLMENTS] }
  )
})

test('an unknown field refuses by name on both endpoints', async () => {
  await inPinnedTransaction(
    async (client: PoolClient) => {
      const { shipment, payout } = await money(client)
      await asAdmin(admin, async () => {
        const ship = await request(app)
          .post(`/api/shipments/${shipment.id}/charge`)
          .send({ shipping_charge: 11.11, pool_oz_deducted: 9 })
        assert.equal(ship.status, 400, `answered ${ship.status}`)
        assert.match(ship.body?.error?.message ?? '', /"pool_oz_deducted"/)

        const charge = await client.query(`SELECT cost FROM shipping.shipments WHERE id = $1`, [
          shipment.id,
        ])
        assert.notEqual(
          Number(charge.rows[0].cost),
          11.11,
          'the valid half of a refused document was executed'
        )

        const pay = await request(app)
          .patch(`/api/payments/details/${payout.id}`)
          .send({ account_number: '12345678' })
        assert.equal(pay.status, 400, `answered ${pay.status}`)
        assert.match(pay.body?.error?.message ?? '', /"account_number"/)
      })
    },
    { actor: TEST_ACTOR.id, lock: [LOCKS.ORDERS, LOCKS.FULFILLMENTS] }
  )
})
