import { test, afterAll } from 'vitest'
import assert from 'node:assert/strict'
import type { PoolClient } from 'pg'
import request from 'supertest'
import pool from '#pool'
import { mockSessions, restoreSessions, as, asAdmin } from '#shared/testing/session.ts'
import { TEST_ACTOR } from '#shared/testing/actor.ts'
import { inPinnedTransaction } from '#shared/testing/pinned-pool.ts'
import { LOCKS } from '#shared/testing/locks.ts'
import { aUser, anAddress, anOrder, anUnknownId } from '#shared/testing/builders/index.ts'

await mockSessions()
const { default: app } = await import('#app')
const orderRead = await import('#orders/read.ts')

afterAll(async () => {
  restoreSessions()
  await pool.end()
})

const inOrders = <T>(fn: (c: PoolClient) => Promise<T>) =>
  inPinnedTransaction(fn, { actor: TEST_ACTOR.id, lock: [LOCKS.ORDERS, LOCKS.FULFILLMENTS] })

test('GET /api/orders/:id/activity answers an admin with bare rows, newest first', async () => {
  await inOrders(async (c) => {
    const order = await anOrder(c, await aUser(c), { direction: 'purchase' }).withLots(1)
    await c.query(
      `INSERT INTO orders.spot_locks (order_id, metal_id, action, bid, ask, created_at)
       VALUES ($1, 'Gold', 'lock', 100, 110, now() + interval '1 minute')`,
      [order.id]
    )

    await asAdmin(TEST_ACTOR, async () => {
      const res = await request(app).get(`/api/orders/${order.id}/activity`)
      assert.equal(res.status, 200, res.text)
      assert.deepEqual(
        res.body.map((r: { kind: string }) => r.kind),
        ['spots_locked', 'order_created']
      )
      assert.equal(res.body[1].actor_id, TEST_ACTOR.id)
      assert.equal('actor_name' in res.body[1], false, 'an activity row never carries a name')

      const paged = await request(app).get(`/api/orders/${order.id}/activity`).query({ limit: 1 })
      assert.equal(paged.status, 200, paged.text)
      assert.equal(paged.body.length, 1)

      const before = await request(app)
        .get(`/api/orders/${order.id}/activity`)
        .query({ before: res.body[0].at })
      assert.deepEqual(
        before.body.map((r: { kind: string }) => r.kind),
        ['order_created']
      )
    })
  })
})

test('the activity refuses a bad page, an unknown order and a customer', async () => {
  await inOrders(async (c) => {
    const owner = await aUser(c)
    const order = await anOrder(c, owner, { direction: 'purchase' })

    await asAdmin(TEST_ACTOR, async () => {
      const bad = await request(app).get(`/api/orders/${order.id}/activity`).query({ limit: 0 })
      assert.equal(bad.status, 400, bad.text)
      const cursor = await request(app)
        .get(`/api/orders/${order.id}/activity`)
        .query({ before: 'yesterday' })
      assert.equal(cursor.status, 400, cursor.text)
      const missing = await request(app).get(`/api/orders/${anUnknownId()}/activity`)
      assert.equal(missing.status, 404, missing.text)
    })

    await as({ ...owner, role: 'user' }, async () => {
      const own = await request(app).get(`/api/orders/${order.id}/activity`)
      assert.equal(own.status, 403, own.text)
    })
  })
})

test('each list item carries the same actions the order view offers', async () => {
  await inOrders(async (c) => {
    const owner = await aUser(c)
    const address = await anAddress(c, owner)
    const purchase = await anOrder(c, owner, { direction: 'purchase' })
      .withLots(2)
      .withAddress(address)
      .withFulfillment('CARRIER DROPOFF')
    const sale = await anOrder(c, owner, { direction: 'sale' }).withLots(1)
    const cancelled = await anOrder(c, owner, {
      direction: 'purchase',
      cancelled_at: new Date().toISOString(),
    })

    await asAdmin(TEST_ACTOR, async () => {
      const list = await request(app).get('/api/orders').query({ user_id: owner.id })
      assert.equal(list.status, 200, list.text)

      for (const order of [purchase, sale, cancelled]) {
        const item = list.body.items.find((o: { id: string }) => o.id === order.id)
        assert.ok(item, `order ${order.id} is missing from the list`)
        const view = await request(app).get(`/api/orders/${order.id}`)
        assert.equal(view.status, 200, view.text)
        assert.ok(item.actions.length > 0, 'the list item offers no action')
        assert.deepEqual(item.actions, view.body.actions)
      }
    })

    await as({ ...owner, role: 'user' }, async () => {
      const own = await request(app).get('/api/orders')
      assert.equal(own.status, 200, own.text)
      for (const item of own.body.items) assert.deepEqual(item.actions, [])
    })
  })
})

test('the list decides every card in one pass, with no per-item view query', async () => {
  await inOrders(async (c) => {
    const owner = await aUser(c)
    for (let i = 0; i < 4; i += 1) {
      await anOrder(c, owner, { direction: i % 2 === 0 ? 'purchase' : 'sale' }).withLots(1)
    }

    const statements: string[] = []
    const spy = new Proxy(c, {
      get(target, key, receiver) {
        if (key === 'query') {
          return (text: unknown, ...rest: unknown[]) => {
            statements.push(typeof text === 'string' ? text : String(text))
            return (target.query as (...a: unknown[]) => unknown).call(target, text, ...rest)
          }
        }
        const value = Reflect.get(target, key, receiver)
        return typeof value === 'function' ? value.bind(target) : value
      },
    }) as PoolClient

    const list = await orderRead.list({ user_id: owner.id }, spy)
    assert.equal(list.items.length, 4)
    assert.ok(list.items.every((item) => item.actions.length > 0))
    assert.equal(
      statements.length,
      2,
      `the list ran ${statements.length} statements; one sort read and one list read`
    )
    assert.ok(
      statements.every((text) => !/AS pickup/.test(text)),
      'the list ran the order view query'
    )
  })
})
