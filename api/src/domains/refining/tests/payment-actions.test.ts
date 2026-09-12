import { test, beforeEach, afterAll } from 'vitest'
import assert from 'node:assert/strict'
import type { PoolClient } from 'pg'
import request from 'supertest'
import pool from '#pool'
import { mockSessions, restoreSessions, asAdmin } from '#shared/testing/session.ts'
import { TEST_ACTOR } from '#shared/testing/actor.ts'
import { inPinnedTransaction } from '#shared/testing/pinned-pool.ts'
import { LOCKS } from '#shared/testing/locks.ts'
import { aUser, anOrder } from '#shared/testing/builders/index.ts'
import { bankLinks } from '#db'
import * as moovFake from '#providers/moov/fake.ts'
import * as rails from '#transactions/rails/service.ts'

process.env.MOOV_ACCOUNT_ID = 'acct_platform'
process.env.MOOV_WALLET_PAYMENT_METHOD_ID = 'pm_wallet'

await mockSessions()
const { default: app } = await import('#app')

beforeEach(() => moovFake.reset())
afterAll(async () => {
  restoreSessions()
  await pool.end()
})

const inRefining = <T>(fn: (c: PoolClient) => Promise<T>) =>
  inPinnedTransaction(fn, { actor: TEST_ACTOR.id, lock: LOCKS.ORDERS })

const refinerId = async (c: PoolClient): Promise<string> => {
  const { rows } = await c.query<{ id: string }>('SELECT id FROM refiners.refiners LIMIT 1')
  assert.ok(rows[0], 'the test database has no refiner')
  return rows[0].id
}

const aFinalizedOrder = async (c: PoolClient) => {
  const seller = await aUser(c)
  const order = await anOrder(c, seller, { direction: 'purchase' })
    .withLots(2, { confirmed: true })
    .withSpots()
    .withTotals({ total: 900 })
  await c.query(`UPDATE orders.orders SET spots_locked = true WHERE id = $1`, [order.id])
  return order
}

type ActionRow = { name: string; confirm: string | null; override: string | null }
const named = (actions: ActionRow[], name: string) => actions.find((a) => a.name === name)

test('a refiner buy order offers send_payment - confirmed before settlement, overridden once a payout is sent', async () => {
  await inRefining(async (c) => {
    const order = await aFinalizedOrder(c)
    const refiner_contact = await aUser(c)
    const link = await bankLinks.create(
      {
        user_id: refiner_contact.id,
        provider: 'moov',
        moov_account_id: 'acct_refiner',
        moov_bank_account_id: 'bank_refiner',
        payment_method_id: 'pm_refiner',
        rail: 'WIRE',
        holder_name: 'Refiner LLC',
        bank_name: 'Refiner Bank',
        last_four: '9999',
        status: 'verified',
        linked_by: 'plaid',
      },
      c
    )

    await asAdmin(TEST_ACTOR, async () => {
      const made = await request(app)
        .post('/api/refining/orders')
        .send({
          refiner_id: await refinerId(c),
          direction: 'buy',
          lot_ids: order.lots.map((lot) => lot.lot_id),
        })
      assert.equal(made.status, 201, made.text)
      assert.equal(made.body.payment.direction, 'buy')
      assert.equal(made.body.payment.state, null, 'no payout has been opened yet')

      const before = named(made.body.actions, 'send_payment')
      assert.ok(before, 'send_payment was not offered before settlement')
      assert.match(before.confirm ?? '', /has not been settled/)
      assert.equal(before.override, null)

      const opened = await request(app)
        .post('/api/payments/payouts')
        .send({ refining_order_id: made.body.id, rail: 'WIRE', bank_link_id: link.id })
      assert.equal(opened.status, 201, opened.text)

      const sent = await request(app).post(`/api/payments/payouts/${opened.body.id}/send`).send({})
      assert.equal(sent.status, 200, sent.text)
      const event = moovFake.eventFor(sent.body.provider_ref as string, 'completed')
      assert.equal(await rails.applyMoovEvent(event), true)

      const view = await request(app).get(`/api/refining/orders/${made.body.id}`)
      assert.equal(view.body.payment.state, 'Sent')
      const after = named(view.body.actions, 'send_payment')
      assert.ok(after, 'send_payment disappeared once a payout was sent')
      assert.match(after.override ?? '', /already has a Sent payout/)

      const again = await request(app).post(`/api/payments/payouts/${opened.body.id}/send`).send({})
      assert.equal(again.status, 409, again.text)
    })
  })
})

test('a refiner sell order settling paid offers request_payment then mark_received, and neither survives Received', async () => {
  await inRefining(async (c) => {
    const order = await aFinalizedOrder(c)
    await asAdmin(TEST_ACTOR, async () => {
      const made = await request(app)
        .post('/api/refining/orders')
        .send({
          refiner_id: await refinerId(c),
          direction: 'sell',
          settlement_type: 'paid',
          lot_ids: order.lots.map((lot) => lot.lot_id),
        })
      assert.equal(made.status, 201, made.text)
      assert.notEqual(made.body.payment, null, 'a paid sell order carries a payment shell')
      assert.equal(made.body.payment.direction, 'sell')
      assert.equal(made.body.payment.state, null)
      assert.ok(named(made.body.actions, 'request_payment'), 'request_payment was not offered')
      assert.ok(
        !named(made.body.actions, 'mark_received'),
        'mark_received was offered with no charge open'
      )

      const opened = await request(app)
        .post('/api/payments/charges')
        .send({ refining_order_id: made.body.id, rail: 'WIRE' })
      assert.equal(opened.status, 201, opened.text)

      const midway = await request(app).get(`/api/refining/orders/${made.body.id}`)
      assert.equal(midway.body.payment.state, 'Due')
      assert.ok(named(midway.body.actions, 'request_payment'))
      assert.ok(named(midway.body.actions, 'mark_received'))

      const received = await request(app)
        .patch(`/api/payments/charges/${opened.body.id}`)
        .send({ reference: 'WIRE-CONF-4200' })
      assert.equal(received.status, 200, received.text)
      assert.equal(received.body.state, 'Received')

      const after = await request(app).get(`/api/refining/orders/${made.body.id}`)
      assert.equal(after.body.payment.state, 'Received')
      assert.ok(
        !named(after.body.actions, 'request_payment'),
        'request_payment survived a Received charge'
      )
      assert.ok(
        !named(after.body.actions, 'mark_received'),
        'mark_received survived a Received charge'
      )
    })
  })
})

test('a pooled refiner sell order carries no payment at all, and offers none of the payment actions', async () => {
  await inRefining(async (c) => {
    const order = await aFinalizedOrder(c)
    await asAdmin(TEST_ACTOR, async () => {
      const made = await request(app)
        .post('/api/refining/orders')
        .send({
          refiner_id: await refinerId(c),
          direction: 'sell',
          lot_ids: order.lots.map((lot) => lot.lot_id),
        })
      assert.equal(made.status, 201, made.text)
      assert.equal(made.body.settlement_type, 'pooled')
      assert.equal(made.body.payment, null, 'a pooled sale carries a charge, priced by pool locks')
      for (const name of ['send_payment', 'request_payment', 'mark_received']) {
        assert.ok(!named(made.body.actions, name), `${name} was offered on a pooled sell order`)
      }
    })
  })
})
