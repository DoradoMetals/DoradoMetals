import { test, afterAll } from 'vitest'
import assert from 'node:assert/strict'
import type { PoolClient } from 'pg'
import request from 'supertest'
import pool from '#pool'
import { mockSessions, restoreSessions, asAdmin } from '#shared/testing/session.ts'
import { TEST_ACTOR } from '#shared/testing/actor.ts'
import { inPinnedTransaction } from '#shared/testing/pinned-pool.ts'
import { LOCKS } from '#shared/testing/locks.ts'
import { aUser, aProduct, anOrder } from '#shared/testing/builders/index.ts'

const ORDER_LOCK = LOCKS.ORDERS

await mockSessions()
const { default: app } = await import('#app')

const admin = TEST_ACTOR

afterAll(async () => {
  restoreSessions()
  await pool.end()
})

const refinerId = async (c: PoolClient): Promise<string> => {
  const { rows } = await c.query<{ id: string }>('SELECT id FROM refiners.refiners LIMIT 1')
  assert.ok(rows[0], 'the test database has no refiner to order from')
  return rows[0].id
}

const aSaleOrder = async (c: PoolClient) => {
  const buyer = await aUser(c)
  const product = await aProduct(c, { metal_id: 'Gold', content: 1 })
  return await anOrder(c, buyer, { direction: 'sale' }).withBullion(product, 2)
}

const UNKNOWN = '00000000-0000-4000-8000-000000000000'

test('a purchase order is not supplied: its metal goes OUT to be refined', async () => {
  await inPinnedTransaction(
    async (c: PoolClient) => {
      const order = await anOrder(c, await aUser(c), { direction: 'purchase' }).withLots(1)
      await asAdmin(admin, async () => {
        const res = await request(app)
          .post(`/api/orders/${order.id}/supply`)
          .send({ refiner_id: await refinerId(c) })
        assert.equal(res.status, 422, `answered ${res.status}`)
        assert.match(res.body?.error?.message ?? '', /sale-direction operation/)
      })
    },
    { actor: TEST_ACTOR.id, lock: ORDER_LOCK }
  )
})

test('a refiner that does not exist is refused, and nothing is written', async () => {
  await inPinnedTransaction(
    async (c: PoolClient) => {
      const order = await aSaleOrder(c)
      await asAdmin(admin, async () => {
        const res = await request(app)
          .post(`/api/orders/${order.id}/supply`)
          .send({ refiner_id: UNKNOWN })
        assert.equal(res.status, 404, `answered ${res.status}`)
      })
      const { rows } = await c.query(
        `SELECT count(*)::int n FROM refining.lots rl
           JOIN inventory.lot_sources s ON s.lot_id = rl.lot_id AND s.kind = 'batch'
           JOIN orders.lots ol ON ol.lot_id = s.source_lot_id
          WHERE ol.order_id = $1`,
        [order.id]
      )
      assert.equal(rows[0]!.n, 0, 'a refused supply assigned lots anyway')
    },
    { actor: TEST_ACTOR.id, lock: ORDER_LOCK }
  )
})

test('supplying a sales order opens a buy order over its own lots and sends it', async () => {
  await inPinnedTransaction(
    async (c: PoolClient) => {
      const order = await aSaleOrder(c)
      await asAdmin(admin, async () => {
        const res = await request(app)
          .post(`/api/orders/${order.id}/supply`)
          .send({ refiner_id: await refinerId(c) })
        assert.equal(res.status, 201, `answered ${res.status}: ${JSON.stringify(res.body)}`)
        assert.equal(res.body.direction, 'buy')
        assert.ok(res.body.sent_at, 'the supplier order was opened but never sent')
        assert.deepEqual(
          res.body.lots
            .flatMap((l: { sources: { id: string }[] }) => l.sources.map((s) => s.id))
            .sort(),
          order.lots.map((l) => l.lot_id).sort(),
          'the refiner lots do not source back to the customer order they came off'
        )
        assert.equal(
          res.body.lots[0].order_number,
          order.number,
          'the refiner order does not name the customer order its metal came off'
        )
      })
    },
    { actor: TEST_ACTOR.id, lock: ORDER_LOCK }
  )
})

test('a lot already on a refiner order cannot be supplied twice', async () => {
  await inPinnedTransaction(
    async (c: PoolClient) => {
      const order = await aSaleOrder(c)
      const refiner_id = await refinerId(c)
      await asAdmin(admin, async () => {
        const first = await request(app).post(`/api/orders/${order.id}/supply`).send({ refiner_id })
        assert.equal(first.status, 201, first.text)

        const again = await request(app).post(`/api/orders/${order.id}/supply`).send({ refiner_id })
        assert.equal(again.status, 409, `answered ${again.status}`)
        assert.match(again.body?.error?.message ?? '', /already on another refiner order/)
      })
    },
    { actor: TEST_ACTOR.id, lock: ORDER_LOCK }
  )
})

test('the supply body is one id, and nothing else is a field of it', async () => {
  await inPinnedTransaction(
    async (c: PoolClient) => {
      const order = await aSaleOrder(c)
      await asAdmin(admin, async () => {
        const res = await request(app)
          .post(`/api/orders/${order.id}/supply`)
          .send({ refiner_id: await refinerId(c), send: false })
        assert.equal(res.status, 400, `answered ${res.status}`)
        assert.match(res.body?.error?.message ?? '', /send/)

        const missing = await request(app).post(`/api/orders/${order.id}/supply`).send({})
        assert.equal(missing.status, 400, `answered ${missing.status}`)
        assert.match(missing.body?.error?.message ?? '', /refiner_id/)
      })
    },
    { actor: TEST_ACTOR.id, lock: ORDER_LOCK }
  )
})
