import { test, afterAll } from 'vitest'
import assert from 'node:assert/strict'
import request from 'supertest'
import pool from '#pool'
import { mockSessions, restoreSessions, as, asAdmin } from '#shared/testing/session.ts'
import { TEST_ACTOR } from '#shared/testing/actor.ts'
import { inPinnedTransaction } from '#shared/testing/pinned-pool.ts'
import { aUser, anAdmin, anOrder } from '#shared/testing/builders/index.ts'
import type { PoolClient } from 'pg'

await mockSessions()
const { default: app } = await import('#app')

import { LOCKS } from '#shared/testing/locks.ts'
const ORDER_LOCK = LOCKS.ORDERS

type UserFixture = { id: string; name: string | null; email: string | null }
type OrderFixture = {
  id: string
  user_id: string
  purchase_order_status: string
  order_number: number
}

const world = async (c: PoolClient) => {
  const victimUser = await aUser(c, { name: 'The Owner' })
  const strangerUser = await aUser(c, { name: 'The Stranger' })
  const order = await anOrder(c, victimUser, { direction: 'purchase' }).withLots(1).withSpots()
  return {
    victim: { ...victimUser, role: 'user' },
    stranger: { ...strangerUser, role: 'user' },
    order: { id: order.id, user_id: victimUser.id },
  }
}

afterAll(async () => {
  restoreSessions()
  await pool.end()
})

test("a stranger cannot read the spots frozen on somebody else's order", async () => {
  await inPinnedTransaction(
    async (c: PoolClient) => {
      const { stranger, order } = await world(c)
      await as(stranger, async () => {
        const res = await request(app).get(`/api/orders/${order.id}/spots`)
        assert.equal(res.status, 403, `answered ${res.status} with somebody else's spot prices`)
      })
    },
    { actor: TEST_ACTOR.id, lock: ORDER_LOCK }
  )
})

test("a plain user cannot finalize an order's pricing, even their own", async () => {
  await inPinnedTransaction(
    async (c: PoolClient) => {
      const { victim, order } = await world(c)
      await as(victim, async () => {
        const res = await request(app).patch(`/api/orders/${order.id}`).send({ finalize: true })
        assert.equal(res.status, 403, `answered ${res.status} - a customer priced an order`)
      })
    },
    { actor: TEST_ACTOR.id, lock: ORDER_LOCK }
  )
})

test("a stranger cannot cancel somebody else's order", async () => {
  await inPinnedTransaction(
    async (c: PoolClient) => {
      const { stranger, order } = await world(c)
      await as(stranger, async () => {
        const res = await request(app)
          .patch(`/api/orders/${order.id}`)
          .send({ cancel: { return_shipment: {} } })
        assert.equal(
          res.status,
          403,
          `answered ${res.status} - a stranger reached the code that buys a return label`
        )
      })
    },
    { actor: TEST_ACTOR.id, lock: ORDER_LOCK }
  )
})

test("the order's own customer can still read its spots", async () => {
  await inPinnedTransaction(
    async (c: PoolClient) => {
      const { victim, order } = await world(c)
      await as(victim, async () => {
        const res = await request(app).get(`/api/orders/${order.id}/spots`)
        assert.equal(
          res.status,
          200,
          `the owner was refused their own order: ${res.status} - ` +
            `order ${order.id} owned by ${order.user_id}, caller ${victim.id}, ` +
            `body ${JSON.stringify(res.body)}`
        )
        assert.ok(Array.isArray(res.body))
      })
    },
    { actor: TEST_ACTOR.id, lock: ORDER_LOCK }
  )
})

test('an admin can still reach any order', async () => {
  await inPinnedTransaction(
    async (c: PoolClient) => {
      const { order } = await world(c)
      await asAdmin(TEST_ACTOR, async () => {
        const res = await request(app).get(`/api/orders/${order.id}/spots`)
        assert.equal(res.status, 200, 'an admin was refused an order they administer')
      })
    },
    { actor: TEST_ACTOR.id, lock: ORDER_LOCK }
  )
})

test("a stranger cannot read somebody else's order", async () => {
  await inPinnedTransaction(
    async (c: PoolClient) => {
      const { stranger, order } = await world(c)
      await as(stranger, async () => {
        const res = await request(app).get(`/api/orders/${order.id}`)
        assert.equal(res.status, 403, `answered ${res.status} with somebody else's order`)
      })
    },
    { actor: TEST_ACTOR.id, lock: ORDER_LOCK }
  )
})

test("a stranger cannot read somebody else's order documents", async () => {
  await inPinnedTransaction(
    async (c: PoolClient) => {
      const { stranger, order } = await world(c)
      await as(stranger, async () => {
        const res = await request(app).get(`/api/orders/${order.id}/documents`)
        assert.equal(res.status, 403, `answered ${res.status} with somebody else's documents`)
      })
    },
    { actor: TEST_ACTOR.id, lock: ORDER_LOCK }
  )
})

test('the order owner can read their own order and its documents', async () => {
  await inPinnedTransaction(
    async (c: PoolClient) => {
      const { victim, order } = await world(c)
      await as(victim, async () => {
        const view = await request(app).get(`/api/orders/${order.id}`)
        assert.equal(view.status, 200, view.text)

        const docs = await request(app).get(`/api/orders/${order.id}/documents`)
        assert.equal(docs.status, 200, docs.text)
        assert.ok(Array.isArray(docs.body))
      })
    },
    { actor: TEST_ACTOR.id, lock: ORDER_LOCK }
  )
})

test("no admin-only field leaks to the order's own customer, on the view or the list", async () => {
  await inPinnedTransaction(
    async (c: PoolClient) => {
      const { victim, order } = await world(c)
      const rep = await anAdmin(c, { name: 'The Rep' })
      await c.query(
        `UPDATE orders.orders SET notes = 'internal only', assigned_to_id = $2 WHERE id = $1`,
        [order.id, rep.id]
      )

      await as(victim, async () => {
        const view = await request(app).get(`/api/orders/${order.id}`)
        assert.equal(view.status, 200, view.text)
        assert.equal(view.body.order.notes, null, "the customer's own order leaked its notes")
        assert.equal(
          view.body.order.assigned_to_id,
          null,
          "the customer's own order leaked who it is assigned to"
        )

        const list = await request(app).get('/api/orders?direction=purchase')
        assert.equal(list.status, 200, list.text)
        const listed = list.body.items.find((o: { id: string }) => o.id === order.id)
        assert.ok(listed, 'the order is missing from the customer own list')
        assert.equal(listed.notes, null, "the customer's order list leaked notes")
        assert.equal(listed.assigned_to_id, null, "the customer's order list leaked assigned_to_id")
      })

      await asAdmin(rep, async () => {
        const view = await request(app).get(`/api/orders/${order.id}`)
        assert.equal(view.status, 200, view.text)
        assert.equal(view.body.order.notes, 'internal only', 'an admin lost the order notes')
        assert.equal(
          view.body.order.assigned_to_id,
          rep.id,
          'an admin lost who the order is assigned to'
        )
      })
    },
    { actor: TEST_ACTOR.id, lock: ORDER_LOCK }
  )
})
