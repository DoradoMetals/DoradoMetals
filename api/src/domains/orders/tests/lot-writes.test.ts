import { test, afterAll } from 'vitest'
import assert from 'node:assert/strict'
import type { PoolClient } from 'pg'
import request from 'supertest'
import pool from '#pool'
import { mockSessions, restoreSessions, asAdmin } from '#shared/testing/session.ts'
import { inPinnedTransaction } from '#shared/testing/pinned-pool.ts'
import { LOCKS } from '#shared/testing/locks.ts'
import { TEST_ACTOR } from '#shared/testing/actor.ts'
import { aUser, anOrder, aProduct } from '#shared/testing/builders/index.ts'

const ITEM_LOCKS = [LOCKS.SCRAP_SWEEP, LOCKS.ORDERS]

await mockSessions()
const { default: app } = await import('#app')

const admin = TEST_ACTOR

const aPurchaseOrderWithABullionLine = async (c: PoolClient) => {
  const customer = await aUser(c)
  const product = await aProduct(c)
  const order = await anOrder(c, customer, { direction: 'purchase' })
    .withBullion(product, 2, { premium: 12.5 })
    .withSpots()
  return { customer, order, bullionItem: { id: order.lots[0]!.id } }
}

afterAll(async () => {
  restoreSessions()
  await pool.end()
})

test('the quantity is written alone, and the premium beside it is untouched', async () => {
  await inPinnedTransaction(
    async (client: PoolClient) => {
      const { bullionItem } = await aPurchaseOrderWithABullionLine(client)
      await asAdmin(admin, async () => {
        await request(app).patch(`/api/orders/lots/${bullionItem.id}`).send({ quantity: 2 })

        const before = await client.query(`SELECT premium FROM orders.lots WHERE id = $1`, [
          bullionItem.id,
        ])
        assert.notEqual(before.rows[0].premium, null, 'the fixture line has no premium to lose')

        const res = await request(app)
          .patch(`/api/orders/lots/${bullionItem.id}`)
          .send({ quantity: 7 })

        assert.equal(res.status, 200, `answered ${res.status}: ${JSON.stringify(res.body)}`)

        const { rows } = await client.query(
          `SELECT li.quantity, ol.premium FROM orders.lots ol JOIN lots.items li ON li.id = ol.lot_id WHERE ol.id = $1`,
          [bullionItem.id]
        )
        assert.equal(Number(rows[0].quantity), 7, 'the quantity did not change')
        assert.notEqual(rows[0].premium, null, 'the premium beside the quantity was nulled')
      })
    },
    { actor: TEST_ACTOR.id, lock: ITEM_LOCKS }
  )
})

test('POST :id/lots mints a lot and links it to the order', async () => {
  await inPinnedTransaction(
    async (client: PoolClient) => {
      const { order } = await aPurchaseOrderWithABullionLine(client)
      await asAdmin(admin, async () => {
        const before = await client.query(
          `SELECT count(*)::int n FROM orders.lots WHERE order_id = $1`,
          [order.id]
        )

        const {
          rows: [gold],
        } = await client.query(`SELECT id FROM metals.metals WHERE id = 'Gold'`)
        const res = await request(app).post(`/api/orders/${order.id}/lots`).send({
          metal_id: gold.id,
          pre_melt: 1.5,
          purity: 0.585,
          unit: 't oz',
        })

        assert.equal(res.status, 201, `answered ${res.status}: ${JSON.stringify(res.body)}`)

        const after = await client.query(
          `SELECT count(*)::int n FROM orders.lots WHERE order_id = $1`,
          [order.id]
        )
        assert.equal(
          Number(after.rows[0].n),
          Number(before.rows[0].n) + 1,
          'the route answered 201 but added no lot'
        )
      })
    },
    { actor: TEST_ACTOR.id, lock: ITEM_LOCKS }
  )
})
