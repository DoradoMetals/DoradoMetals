import { test, afterAll } from 'vitest'
import assert from 'node:assert/strict'
import type { PoolClient } from 'pg'
import request from 'supertest'
import pool from '#pool'
import { mockSessions, restoreSessions, asAdmin } from '#shared/testing/session.ts'
import { TEST_ACTOR } from '#shared/testing/actor.ts'
import { inPinnedTransaction } from '#shared/testing/pinned-pool.ts'
import { LOCKS } from '#shared/testing/locks.ts'
import { aUser, anOrder, aShipment } from '#shared/testing/builders/index.ts'

await mockSessions()
const { default: app } = await import('#app')

afterAll(async () => {
  restoreSessions()
  await pool.end()
})

const parcel = async (c: PoolClient) => {
  const customer = await aUser(c)
  const order = await anOrder(c, customer, { direction: 'purchase' }).withLots(1)
  return { order, shipment: await aShipment(c, order) }
}

const opts = { actor: TEST_ACTOR.id, lock: [LOCKS.ORDERS, LOCKS.FULFILLMENTS] }

test('open, refuse a second, resolve, list by shipment and by order', async () => {
  await inPinnedTransaction(async (client: PoolClient) => {
    const { order, shipment } = await parcel(client)
    await asAdmin(TEST_ACTOR, async () => {
      const base = `/api/shipments/${shipment.id}/claims`
      const opened = await request(app).post(base).send({ kind: 'lost', amount: 100 })
      assert.equal(opened.status, 201, JSON.stringify(opened.body))
      assert.equal(opened.body.status, 'Pending')

      const second = await request(app).post(base).send({ kind: 'damaged', amount: 5 })
      assert.equal(second.status, 409)

      const empty = await request(app).patch(`${base}/${opened.body.id}`).send({})
      assert.equal(empty.status, 422)

      const early = await request(app).patch(`${base}/${opened.body.id}`).send({ paid_amount: 50 })
      assert.equal(early.status, 422)

      const paid = await request(app)
        .patch(`${base}/${opened.body.id}`)
        .send({ status: 'Paid', paid_amount: 80 })
      assert.equal(paid.status, 200, JSON.stringify(paid.body))
      assert.equal(paid.body.status, 'Paid')
      assert.equal(paid.body.paid_amount, 80)
      assert.ok(paid.body.resolved_at)

      const reopened = await request(app)
        .patch(`${base}/${opened.body.id}`)
        .send({ status: 'Pending' })
      assert.equal(reopened.status, 200)
      assert.equal(reopened.body.resolved_at, null)
      assert.equal(reopened.body.paid_amount, null)

      const list = await request(app).get(base)
      assert.equal(list.status, 200)
      assert.equal(list.body.length, 1)

      const byOrder = await request(app).get(`/api/orders/${order.id}/claims`)
      assert.equal(byOrder.status, 200)
      assert.equal(byOrder.body.length, 1)
    })
  }, opts)
})

test('an unknown shipment and a claim on another shipment are 404', async () => {
  await inPinnedTransaction(async (client: PoolClient) => {
    const a = await parcel(client)
    const b = await parcel(client)
    await asAdmin(TEST_ACTOR, async () => {
      const none = await request(app)
        .post('/api/shipments/00000000-0000-4000-8000-000000000000/claims')
        .send({ kind: 'lost', amount: 1 })
      assert.equal(none.status, 404)

      const opened = await request(app)
        .post(`/api/shipments/${a.shipment.id}/claims`)
        .send({ kind: 'lost', amount: 1 })
      const wrong = await request(app)
        .patch(`/api/shipments/${b.shipment.id}/claims/${opened.body.id}`)
        .send({ note: 'x' })
      assert.equal(wrong.status, 404)
    })
  }, opts)
})
