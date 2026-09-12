import { test, afterAll } from 'vitest'
import assert from 'node:assert/strict'
import request from 'supertest'
import pool from '#pool'
import { mockSessions, restoreSessions, as, anonymous } from '#shared/testing/session.ts'
import { TEST_ACTOR, TEST_CUSTOMER } from '#shared/testing/actor.ts'
import { inPinnedTransaction, outside } from '#shared/testing/pinned-pool.ts'
import { aUser, anOrder, aShipment } from '#shared/testing/builders/index.ts'
import type { PoolClient } from 'pg'
import { LOCKS } from '#shared/testing/locks.ts'

await mockSessions()
const { default: app } = await import('#app')

const FULFILLMENT_LOCK = [LOCKS.ORDERS, LOCKS.FULFILLMENTS]

type UserFixture = { id: string; name: string | null; email: string | null }
type Caller = UserFixture & { role: string }
type OrderFixture = { id: string; user_id: string }

const admin: Caller = { ...TEST_ACTOR, role: 'admin' }
const stranger: Caller = { ...TEST_CUSTOMER, role: 'user' }

const anOwnedOrderWithFulfillment = async (c: PoolClient) => {
  const user = await aUser(c)
  const built = await anOrder(c, user, { direction: 'purchase' })
  await aShipment(c, built, { method: 'CARRIER DROPOFF' })
  return {
    order: { id: built.id, user_id: user.id },
    owner: { ...user, role: 'user' } as Caller,
  }
}

afterAll(async () => {
  restoreSessions()
  await pool.end()
})

test('the method menu is refused to anonymous and filtered by direction', async () => {
  await inPinnedTransaction(
    async (c: PoolClient) => {
      const { order, owner } = await anOwnedOrderWithFulfillment(c)
      await anonymous(async () => {
        const res = await request(app)
          .get('/api/fulfillments/methods')
          .query({ direction: 'purchase' })
        assert.ok([401, 403].includes(res.status), `answered ${res.status}`)
      })

      await as(owner, async () => {
        const res = await request(app)
          .get('/api/fulfillments/methods')
          .query({ direction: 'purchase' })
        assert.equal(res.status, 200, JSON.stringify(res.body))
        assert.ok(Array.isArray(res.body) && res.body.length > 0)
        assert.ok(
          res.body.every((m) => m.direction === 'purchase' && m.enabled && !m.hidden),
          'the customer menu offered a hidden, disabled, or wrong-direction method'
        )
      })
    },
    { actor: TEST_ACTOR.id, lock: FULFILLMENT_LOCK }
  )
})

test("a stranger cannot read the fulfillment of somebody else's order", async () => {
  await inPinnedTransaction(
    async (c: PoolClient) => {
      const { order } = await anOwnedOrderWithFulfillment(c)
      await as(stranger, async () => {
        const res = await request(app).get(`/api/orders/${order.id}/fulfillments`)
        assert.equal(res.status, 403, JSON.stringify(res.body))
      })
    },
    { actor: TEST_ACTOR.id, lock: FULFILLMENT_LOCK }
  )
})

test("the order's own customer and an admin can both read it", async () => {
  await inPinnedTransaction(
    async (c: PoolClient) => {
      const { order, owner } = await anOwnedOrderWithFulfillment(c)
      for (const who of [owner, admin]) {
        await as(who, async () => {
          const res = await request(app).get(`/api/orders/${order.id}/fulfillments`)
          assert.equal(res.status, 200, JSON.stringify(res.body))
          assert.ok(res.body, `${who.role} was refused a fulfillment they may see`)
          assert.equal(res.body.fulfillment.order_id, order.id)
          assert.ok(res.body.fulfillment.method_id, 'the row lost its method_id')
          assert.ok(res.body.method, 'the method object did not reach the wire')
        })
      }
    },
    { actor: TEST_ACTOR.id, lock: FULFILLMENT_LOCK }
  )
})

test('a customer cannot reach any of the admin fulfillment routes', async () => {
  await inPinnedTransaction(
    async () => {
      await as(stranger, async () => {
        const calls = [
          ['get', '/api/fulfillments/methods/all', {}],
          ['get', '/api/fulfillments/schedule', {}],
          ['post', '/api/fulfillments/schedule_pickup', { pickup: {} }],
          ['post', '/api/fulfillments/schedule_direct', { direct: {} }],
          ['post', '/api/fulfillments/cancel_schedule', { fulfillment_id: null }],
          ['post', '/api/fulfillments/set_method', { fulfillment_id: null, method_id: null }],
          ['post', '/api/fulfillments/set_status', { fulfillment_id: null, status: 'COMPLETED' }],
        ]
        for (const [verb, path, body] of calls as Array<
          ['get' | 'post', string, Record<string, unknown>]
        >) {
          const res = await request(app)[verb](path).send(body)
          assert.equal(res.status, 403, `${path} answered ${res.status} to a customer`)
        }
      })
    },
    { actor: TEST_ACTOR.id, lock: FULFILLMENT_LOCK }
  )
})

test('nothing this file did survived the transaction', async () => {
  const [{ n }] = await outside(`SELECT count(*)::int AS n FROM fulfillments.pickups`)
  const [{ d }] = await outside(`SELECT count(*)::int AS d FROM fulfillments.directs`)
  assert.equal(n, 0, 'a pickup was booked in dev')
  assert.equal(d, 0, 'an appointment was booked in dev')
})
