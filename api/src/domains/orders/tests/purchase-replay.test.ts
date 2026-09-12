import { test, afterAll } from 'vitest'
import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import request from 'supertest'
import pool from '#pool'
import { mockSessions, restoreSessions, as } from '#shared/testing/session.ts'
import { TEST_ACTOR, TEST_CUSTOMER } from '#shared/testing/actor.ts'
import { aUser, anOrder, aPayout } from '#shared/testing/builders/index.ts'
import type { PoolClient } from 'pg'
import { inPinnedTransaction, assertNothingEscaped } from '#shared/testing/pinned-pool.ts'

await mockSessions()
const { default: app } = await import('#app')

import { LOCKS } from '#shared/testing/locks.ts'
const ORDER_LOCK = LOCKS.ORDERS

type UserFixture = { id: string; name: string | null; email: string | null }
type Caller = UserFixture & { role: string }

const admin: Caller = { ...TEST_ACTOR, role: 'admin' }
const customer: Caller = { ...TEST_CUSTOMER, role: 'user' }

afterAll(async () => {
  restoreSessions()
  await pool.end()
})

const MOVE_TO = 'Payment Processing'

const aBuiltOrder = async (c: PoolClient) => {
  const owner = await aUser(c)
  const order = await anOrder(c, owner, { direction: 'purchase', status: 'Pending' })
    .withLots(1, { metal_id: 'Gold' })
    .withLots(1, { metal_id: 'Silver' })
    .withSpots()
    .withTotals({ total: 1000 })
  assert.notEqual(order.status, MOVE_TO, 'the fixture starts in the target status')
  return { id: order.id, number: order.number, status: order.status, user_id: owner.id }
}

test('a customer sees only their own rows, and the admin list is served whole', async () => {
  await inPinnedTransaction(
    async () => {
      await as(customer, async () => {
        const res = await request(app).get('/api/orders?direction=purchase')
        assert.equal(res.status, 200, `answered ${res.status}`)
        assert.ok(
          res.body.every((o: { user_id: string }) => o.user_id === customer.id),
          "a customer's list carried somebody else's purchase order"
        )
      })

      await as(admin, async () => {
        const res = await request(app).get('/api/orders?direction=purchase')
        assert.equal(res.status, 200)
        assert.ok(Array.isArray(res.body) && res.body.length > 0)

        const order = res.body[0]
        for (const field of [
          'id',
          'number',
          'status',
          'created_at',
          'direction',
          'user_id',
          'spots_locked',
          'totals',
          'reference',
          'customer',
        ]) {
          assert.ok(field in order, `the admin list is missing ${field}`)
        }
        for (const gone of ['order_items', 'address', 'user', 'payout', 'shipment']) {
          assert.ok(!(gone in order), `the order wire still carries ${gone}`)
        }
      })
    },
    { actor: TEST_ACTOR.id, lock: ORDER_LOCK }
  )
})

test('no admin order response carries a full bank number', async () => {
  await inPinnedTransaction(
    async (c: PoolClient) => {
      const owner = await aUser(c)
      const order = await anOrder(c, owner, { direction: 'purchase', status: 'Pending' })
        .withLots(1, { metal_id: 'Gold' })
        .withTotals({ total: 100 })
      const payout = await aPayout(c, owner, { order })

      await as(admin, async () => {
        const res = await request(app).get('/api/orders?direction=purchase')
        const body = JSON.stringify(res.body)

        assert.ok(
          !/"routing_number"\s*:\s*"\d{9}"/.test(body),
          'a full routing number is on the wire'
        )
        assert.ok(
          !/"account_number"\s*:\s*"\d{5,}"/.test(body),
          'a full account number is on the wire'
        )

        assert.ok(
          !body.includes(payout.routing_number),
          'a real routing number appears in the response body'
        )
        assert.ok(
          !body.includes(payout.account_number),
          'a real account number appears in the response body'
        )
      })
    },
    { actor: TEST_ACTOR.id, lock: ORDER_LOCK }
  )
})

test("moving an order's status takes the body the drawer sends", async () => {
  await inPinnedTransaction(
    async (c: PoolClient) => {
      const order = await aBuiltOrder(c)

      await as(admin, async () => {
        const res = await request(app).patch(`/api/orders/${order.id}`).send({ status: MOVE_TO })

        assert.equal(res.status, 200, JSON.stringify(res.body))

        const list = await request(app).get('/api/orders?direction=purchase')
        const moved = list.body.find((o: { id: string; status: string }) => o.id === order.id)
        assert.notEqual(
          order.status,
          MOVE_TO,
          'the order was already in the target status - this proves nothing'
        )
        assert.equal(moved.status, MOVE_TO)
      })
    },
    { actor: TEST_ACTOR.id, lock: ORDER_LOCK }
  )
})

test("a customer cannot move an order's status", async () => {
  await inPinnedTransaction(
    async (c: PoolClient) => {
      const order = await aBuiltOrder(c)
      await as(customer, async () => {
        const res = await request(app)
          .patch(`/api/orders/${order.id}`)
          .send({ status: 'Completed' })
        assert.equal(res.status, 403, 'a customer moved their own order to Completed')
      })
    },
    { actor: TEST_ACTOR.id, lock: ORDER_LOCK }
  )
})

test('locking spots freezes them and unlocking releases them', async () => {
  await inPinnedTransaction(
    async (c: PoolClient) => {
      const order = await aBuiltOrder(c)

      await as(admin, async () => {
        const locked = await request(app).put(`/api/orders/${order.id}/spots`).send({ lock: true })
        assert.equal(locked.status, 200, JSON.stringify(locked.body))

        const list = await request(app).get('/api/orders?direction=purchase')
        assert.equal(
          list.body.find((o: { id: string; status: string }) => o.id === order.id).spots_locked,
          true,
          'the order does not report its spots as locked'
        )

        const unlocked = await request(app)
          .put(`/api/orders/${order.id}/spots`)
          .send({ lock: false })
        assert.equal(unlocked.status, 200, JSON.stringify(unlocked.body))

        const after = await request(app).get('/api/orders?direction=purchase')
        const listed = after.body.find(
          (o: { id: string; spots_locked: boolean }) => o.id === order.id
        )
        assert.ok(listed, `order ${order.id} is absent from the list after unlocking`)
        assert.equal(listed.spots_locked, false)
      })
    },
    { actor: TEST_ACTOR.id, lock: ORDER_LOCK }
  )
})

test('changing a spot price lands on that order and no other', async () => {
  await inPinnedTransaction(
    async (c: PoolClient) => {
      const order = await aBuiltOrder(c)

      await as(admin, async () => {
        const metals = await request(app).get(`/api/orders/${order.id}/spots`)
        assert.equal(metals.status, 200, JSON.stringify(metals.body))
        assert.ok(Array.isArray(metals.body) && metals.body.length > 0, 'the order has no spots')

        const spot = metals.body[0]
        const sentinel = 1234.56
        assert.ok('bid' in spot, 'the metals response no longer carries bid')
        assert.ok(!('bid_spot' in spot), 'the metals response still carries the legacy bid_spot')
        assert.ok(!('name' in spot), 'the spots read is smearing a joined name onto the row')

        const res = await request(app)
          .put(`/api/orders/${order.id}/spots`)
          .send({ set: [{ metal_id: spot.metal_id, bid: sentinel }] })
        assert.equal(res.status, 200, JSON.stringify(res.body))

        const after = await request(app).get(`/api/orders/${order.id}/spots`)
        const changed = after.body.find((s: { id: string; bid: string }) => s.id === spot.id)
        assert.equal(Number(changed.bid), sentinel, 'the new price did not stick')

        for (const other of after.body.filter(
          (s: { id: string; bid: string }) => s.id !== spot.id
        )) {
          assert.notEqual(
            Number(other.bid),
            sentinel,
            "one edit changed more than one metal's spot"
          )
        }
      })
    },
    { actor: TEST_ACTOR.id, lock: ORDER_LOCK }
  )
})

test('nothing this file did survived the transaction', async () => {
  assert.equal(
    await assertNothingEscaped('orders.spots', 'bid = 1234.56'),
    0,
    'a sentinel spot price escaped into the new schema'
  )
})
