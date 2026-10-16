import { test, afterAll } from 'vitest'
import assert from 'node:assert/strict'
import type { PoolClient } from 'pg'
import request from 'supertest'
import pool from '#pool'
import { mockSessions, restoreSessions, asAdmin } from '#shared/testing/session.ts'
import { TEST_ACTOR } from '#shared/testing/actor.ts'
import { inPinnedTransaction } from '#shared/testing/pinned-pool.ts'
import { LOCKS } from '#shared/testing/locks.ts'
import {
  aLedgerEntry,
  aPayout,
  aShipment,
  aUser,
  anOrder,
  anUnknownId,
  paymentMethodId,
} from '#shared/testing/builders/index.ts'

await mockSessions()
const { default: app } = await import('#app')

afterAll(async () => {
  restoreSessions()
  await pool.end()
})

const inOrders = <T>(fn: (c: PoolClient) => Promise<T>) =>
  inPinnedTransaction(fn, { actor: TEST_ACTOR.id, lock: [LOCKS.ORDERS, LOCKS.FULFILLMENTS] })

const names = (actions: { name: string }[]) => actions.map((a) => a.name)

test('one payout method with no amount changes the chosen method and clears a split', async () => {
  await inOrders(async (c) => {
    const user = await aUser(c)
    const order = await anOrder(c, user, { direction: 'purchase' })
      .withLots(1)
      .withTotals({ total: 1000 })
    await aPayout(c, user, { order, method: 'ACH' })
    const ach = await paymentMethodId(c, 'ACH', 'purchase')
    const account = await paymentMethodId(c, 'DORADO_ACCOUNT', 'purchase')

    await asAdmin(TEST_ACTOR, async () => {
      const before = await request(app).get(`/api/orders/${order.id}`)
      assert.ok(names(before.body.actions).includes('edit_payout_method'))

      const split = await request(app)
        .put(`/api/orders/${order.id}/payout_methods`)
        .send({
          methods: [
            { method_id: account, amount: 400 },
            { method_id: ach, amount: 600 },
          ],
        })
      assert.equal(split.status, 200, split.text)

      const chosen = await request(app)
        .put(`/api/orders/${order.id}/payout_methods`)
        .send({ methods: [{ method_id: account }] })
      assert.equal(chosen.status, 200, chosen.text)
      assert.equal(chosen.body.payout.method, 'DORADO_ACCOUNT')
      assert.deepEqual(
        chosen.body.payout_methods.map((row: { method: string; amount: number | null }) => [
          row.method,
          row.amount,
        ]),
        [['DORADO_ACCOUNT', null]]
      )

      const unknown = await request(app)
        .put(`/api/orders/${order.id}/payout_methods`)
        .send({ methods: [{ method_id: anUnknownId() }] })
      assert.equal(unknown.status, 404, unknown.text)
    })
  })
})

test('a credited order and an order with no payout details refuse a method change', async () => {
  await inOrders(async (c) => {
    const user = await aUser(c)
    const credited = await anOrder(c, user, { direction: 'purchase' })
      .withLots(1)
      .withTotals({ total: 1000 })
    await aPayout(c, user, { order: credited, method: 'DORADO_ACCOUNT' })
    await aLedgerEntry(c, user, { type: 'Credit', order_id: credited.id, amount: 1000 })
    const bare = await anOrder(c, user, { direction: 'purchase' }).withLots(1)
    const ach = await paymentMethodId(c, 'ACH', 'purchase')

    await asAdmin(TEST_ACTOR, async () => {
      const paid = await request(app)
        .put(`/api/orders/${credited.id}/payout_methods`)
        .send({ methods: [{ method_id: ach }] })
      assert.equal(paid.status, 409, paid.text)

      const none = await request(app)
        .put(`/api/orders/${bare.id}/payout_methods`)
        .send({ methods: [{ method_id: ach }] })
      assert.equal(none.status, 422, none.text)
    })
  })
})

test('the order view counts open disputes and claims, and offers the matching actions', async () => {
  await inOrders(async (c) => {
    const user = await aUser(c)
    const order = await anOrder(c, user, { direction: 'purchase' }).withLots(1)
    const shipment = await aShipment(c, order)

    await asAdmin(TEST_ACTOR, async () => {
      const fresh = await request(app).get(`/api/orders/${order.id}`)
      assert.equal(fresh.status, 200, fresh.text)
      assert.deepEqual(fresh.body.cases, { claims: 0, open_claims: 0, open_disputes: 0 })
      assert.ok(names(fresh.body.actions).includes('open_claim'))
      assert.ok(names(fresh.body.actions).includes('open_dispute'))
      assert.ok(!names(fresh.body.actions).includes('resolve_dispute'))

      const dispute = await request(app)
        .post(`/api/orders/lots/${order.lots[0]!.id}/disputes`)
        .send({ claimed_purity: 0.95, reason: 'reads higher' })
      assert.equal(dispute.status, 201, dispute.text)
      const claim = await request(app)
        .post(`/api/shipments/${shipment.id}/claims`)
        .send({ kind: 'lost', amount: 100 })
      assert.equal(claim.status, 201, claim.text)

      const after = await request(app).get(`/api/orders/${order.id}`)
      assert.deepEqual(after.body.cases, { claims: 1, open_claims: 1, open_disputes: 1 })
      assert.ok(!names(after.body.actions).includes('open_claim'))
      assert.ok(names(after.body.actions).includes('update_claim'))
      assert.ok(!names(after.body.actions).includes('open_dispute'))
      assert.ok(names(after.body.actions).includes('resolve_dispute'))
    })
  })
})
