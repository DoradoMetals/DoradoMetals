import { test, afterAll } from 'vitest'
import assert from 'node:assert/strict'
import request from 'supertest'
import pool from '#pool'
import { mockSessions, restoreSessions, as, anonymous } from '#shared/testing/session.ts'
import { TEST_ACTOR, TEST_CUSTOMER } from '#shared/testing/actor.ts'
import { aUser, aProduct, anOrder, aPayout } from '#shared/testing/builders/index.ts'
import type { PoolClient } from 'pg'
import { inPinnedTransaction, assertNothingEscaped, outside } from '#shared/testing/pinned-pool.ts'
import { LOCKS } from '#shared/testing/locks.ts'

await mockSessions()
const { default: app } = await import('#app')

const ORDER_LOCK = LOCKS.ORDERS

type UserFixture = { id: string; name: string | null; email: string | null }
type Caller = UserFixture & { role: string }
type SalesOrderFixture = {
  id: string
  user_id: string
  number: number | null
}

const admin: Caller = { ...TEST_ACTOR, role: 'admin' }
const stranger: Caller = { ...TEST_CUSTOMER, role: 'user' }

const aSalesOrder = async (c: PoolClient) => {
  const owner = await aUser(c, { name: 'The Buyer' })
  const product = await aProduct(c)
  const built = await anOrder(c, owner, { direction: 'sale' })
    .withBullion(product, 2)
    .withTotals({ total: 5200, items: 5200 })
  return {
    order: { id: built.id, user_id: owner.id, number: built.number },
    owner: { ...owner, role: 'user' } as Caller,
  }
}

afterAll(async () => {
  restoreSessions()
  await pool.end()
})

test('the list is refused to anonymous, and a customer sees only their own rows', async () => {
  await inPinnedTransaction(
    async () => {
      await anonymous(async () => {
        const res = await request(app).get('/api/orders?direction=sale')
        assert.ok([401, 403].includes(res.status), `answered ${res.status}`)
      })
      await as(stranger, async () => {
        const res = await request(app).get('/api/orders?direction=sale')
        assert.equal(res.status, 200, `answered ${res.status}`)
        assert.ok(
          res.body.items.every((o: { user_id: string }) => o.user_id === stranger.id),
          "a customer's list carried somebody else's sales order"
        )
      })
    },
    { actor: TEST_ACTOR.id, lock: ORDER_LOCK }
  )
})

test('the admin list has the fields the drawer destructures', async () => {
  await inPinnedTransaction(
    async () => {
      await as(admin, async () => {
        const res = await request(app).get('/api/orders?direction=sale')
        assert.equal(res.status, 200)
        assert.ok(Array.isArray(res.body.items) && res.body.items.length > 0)

        const o = res.body.items[0]
        for (const field of [
          'id',
          'number',
          'state',
          'created_at',
          'direction',
          'user_id',
          'totals',
          'reference',
          'customer',
        ]) {
          assert.ok(field in o, `the admin sales list is missing ${field}`)
        }
        for (const gone of ['order_items', 'address', 'user', 'shipment']) {
          assert.ok(!(gone in o), `the order wire still carries ${gone}`)
        }
      })
    },
    { actor: TEST_ACTOR.id, lock: ORDER_LOCK }
  )
})

test("a customer's own list is scoped to them, whatever they ask for", async () => {
  await inPinnedTransaction(
    async (c: PoolClient) => {
      const { owner } = await aSalesOrder(c)
      await as(owner, async () => {
        const res = await request(app)
          .get('/api/orders')
          .query({ direction: 'sale', user_id: stranger.id })
        assert.equal(res.status, 200)
        assert.ok(
          res.body.items.every((o: { user_id: string }) => o.user_id === owner.id),
          "asking for somebody else's id returned somebody else's orders"
        )
      })
    },
    { actor: TEST_ACTOR.id, lock: ORDER_LOCK }
  )
})

test("a stranger cannot read the spots frozen on somebody else's sales order", async () => {
  await inPinnedTransaction(
    async (c: PoolClient) => {
      const { order, owner } = await aSalesOrder(c)
      await as(stranger, async () => {
        const res = await request(app).get(`/api/orders/${order.id}/spots`)
        assert.equal(res.status, 403, `answered ${res.status} with another customer's spots`)
      })

      await as(owner, async () => {
        const res = await request(app).get(`/api/orders/${order.id}/spots`)
        assert.equal(res.status, 200, 'the owner was refused their own order')
        assert.ok(Array.isArray(res.body))
      })
    },
    { actor: TEST_ACTOR.id, lock: ORDER_LOCK }
  )
})

test('a customer cannot patch a sales order or send it to a refiner', async () => {
  await inPinnedTransaction(
    async (c: PoolClient) => {
      const { order } = await aSalesOrder(c)
      await as(stranger, async () => {
        const moved = await request(app).patch(`/api/orders/${order.id}`).send({ notes: 'nope' })
        assert.equal(moved.status, 403)

        const sent = await request(app)
          .patch(`/api/orders/${order.id}`)
          .send({ supplier: { supplier_id: null, send: true } })
        assert.equal(sent.status, 403, 'a customer reached the code that emails a refiner')
      })
    },
    { actor: TEST_ACTOR.id, lock: ORDER_LOCK }
  )
})

test('no sales order response carries a full bank number', async () => {
  await inPinnedTransaction(
    async (c: PoolClient) => {
      const { order } = await aSalesOrder(c)
      const payout = await aPayout(c, { id: order.user_id }, { order })

      await as(admin, async () => {
        const res = await request(app).get('/api/orders?direction=sale')
        const body = JSON.stringify(res.body)
        assert.ok(!/"routing_number"\s*:\s*"\d{9}"/.test(body))
        assert.ok(
          !body.includes(payout.routing_number),
          'a real routing number appears in a sales order response'
        )
        assert.ok(
          !body.includes(payout.account_number),
          'a real account number appears in a sales order response'
        )
      })
    },
    { actor: TEST_ACTOR.id, lock: ORDER_LOCK }
  )
})

test('no built sales order survived the transaction', async () => {
  let built = ''
  await inPinnedTransaction(
    async (c: PoolClient) => {
      built = (await aSalesOrder(c)).order.id
    },
    { actor: TEST_ACTOR.id, lock: ORDER_LOCK }
  )

  const rows = await outside(`SELECT id FROM orders.orders WHERE id = $1`, [built])
  assert.equal(rows.length, 0, 'a built sales order was committed to the database')
})
