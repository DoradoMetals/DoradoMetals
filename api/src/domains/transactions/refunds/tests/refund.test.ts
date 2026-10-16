import { test, afterAll } from 'vitest'
import assert from 'node:assert/strict'
import type { PoolClient } from 'pg'
import request from 'supertest'
import pool from '#pool'
import { mockSessions, restoreSessions, asAdmin, asUser } from '#shared/testing/session.ts'
import { TEST_ACTOR } from '#shared/testing/actor.ts'
import { inPinnedTransaction } from '#shared/testing/pinned-pool.ts'
import { anUnknownId, aUser, anOrder } from '#shared/testing/builders/index.ts'
import { LOCKS } from '#shared/testing/locks.ts'
import { aSessionRow } from '#accounts/auth/tests/harness.ts'
import { STEP_UP_FRESH_SECONDS } from '#accounts/auth/rules.ts'
import * as paymentsService from '#transactions/service.ts'
import * as refunds from '#transactions/refunds/service.ts'
import type { RefundIssuer, RefundRequest } from '#providers/stripe/stripe.ts'
import { RefundView } from '@dorado/contracts'

await mockSessions()
const { default: app } = await import('#app')

afterAll(async () => {
  restoreSessions()
  await pool.end()
})

const opts = { actor: TEST_ACTOR.id, lock: [LOCKS.ORDERS, LOCKS.ADDRESSES, LOCKS.USERS] }

const aPaidSale = async (c: PoolClient, cents = 25000) => {
  const buyer = await aUser(c)
  const order = await anOrder(c, buyer, { direction: 'sale' })
  const ref = `pi_${anUnknownId().slice(0, 24)}`
  const intent = { id: ref, status: 'succeeded', amount: cents, amount_received: cents }
  await paymentsService.recordIntent(
    intent,
    { session_id: anUnknownId(), user_id: buyer.id },
    'sales_order_checkout',
    undefined,
    c
  )
  assert.ok(await paymentsService.attachOrder(ref, order.id, c))
  await paymentsService.updateFromProvider(intent, c)
  return { order, buyer, ref, session: await aSessionRow(c, TEST_ACTOR.id, 0) }
}

const issuer = (status: string) => {
  const calls: RefundRequest[] = []
  const issue: RefundIssuer = async (req) => {
    calls.push(req)
    return { provider_ref: `re_${req.idempotencyKey.slice(-8)}`, status, failure_reason: null }
  }
  return { calls, issue }
}

const rowsOf = async (c: PoolClient, order_id: string) =>
  (
    await c.query(
      `SELECT id, state, amount::float AS amount, provider_ref, refunded_at
         FROM payments.refunds WHERE order_id = $1 ORDER BY created_at`,
      [order_id]
    )
  ).rows

test('a refund records Pending, refunds once under its own key, then stamps and ledgers it', async () => {
  await inPinnedTransaction(
    async (c) => {
      const sale = await aPaidSale(c)
      const { calls, issue } = issuer('succeeded')
      const out = await refunds.refund(
        sale.order.id,
        { amount: 40, reason: 'one coin arrived scratched' },
        sale.session,
        issue
      )
      assert.equal(calls.length, 1)
      assert.equal(calls[0]!.paymentIntentId, sale.ref)
      assert.equal(calls[0]!.amountCents, 4000)
      assert.equal(calls[0]!.idempotencyKey, `refund_${out[0]!.id}`)
      assert.equal(out[0]!.state, 'Succeeded')
      assert.ok(out[0]!.refunded_at)
      const ledger = await c.query(
        `SELECT amount::float AS amount FROM payments.ledger WHERE order_id = $1 AND type = 'Refund'`,
        [sale.order.id]
      )
      assert.deepEqual(ledger.rows, [{ amount: 40 }])
    },
    { actor: opts.actor, lock: opts.lock }
  )
})

test('more than was received is refused and writes nothing', async () => {
  await inPinnedTransaction(
    async (c) => {
      const sale = await aPaidSale(c, 10000)
      const { calls, issue } = issuer('succeeded')
      await assert.rejects(
        refunds.refund(
          sale.order.id,
          { amount: 100.01, reason: 'more than they paid us' },
          sale.session,
          issue
        ),
        /left to refund/
      )
      assert.equal(calls.length, 0)
      assert.deepEqual(await rowsOf(c, sale.order.id), [])
    },
    { actor: opts.actor, lock: opts.lock }
  )
})

test('a crash at the provider leaves a Pending row that holds its amount; issue settles it once', async () => {
  await inPinnedTransaction(
    async (c) => {
      const sale = await aPaidSale(c, 10000)
      const crash: RefundIssuer = async () => {
        throw new Error('network went away')
      }
      await refunds.refund(
        sale.order.id,
        { amount: 60, reason: 'crash before the answer' },
        sale.session,
        crash
      )
      const [pending] = await rowsOf(c, sale.order.id)
      assert.equal(pending.state, 'Pending')

      const { calls, issue } = issuer('succeeded')
      await assert.rejects(
        refunds.refund(
          sale.order.id,
          { amount: 50, reason: 'a second click on the same refund' },
          sale.session,
          issue
        ),
        /left to refund/
      )
      assert.equal(calls.length, 0, 'a held Pending refund let a second one through')

      const out = await refunds.resume(sale.order.id, pending.id, sale.session, issue)
      assert.equal(calls.length, 1)
      assert.equal(calls[0]!.idempotencyKey, `refund_${pending.id}`)
      assert.equal(out[0]!.state, 'Succeeded')
      await assert.rejects(
        refunds.resume(sale.order.id, pending.id, sale.session, issue),
        /nothing to issue/
      )
    },
    { actor: opts.actor, lock: opts.lock }
  )
})

test('a provider failure marks the row Failed and frees its amount; no ledger row', async () => {
  await inPinnedTransaction(
    async (c) => {
      const sale = await aPaidSale(c, 10000)
      await refunds.refund(
        sale.order.id,
        { amount: 100, reason: 'card was closed already' },
        sale.session,
        issuer('failed').issue
      )
      const [failed] = await rowsOf(c, sale.order.id)
      assert.equal(failed.state, 'Failed')
      const again = await refunds.refund(
        sale.order.id,
        { amount: 100, reason: 'second try after the failure' },
        sale.session,
        issuer('succeeded').issue
      )
      assert.equal(again.filter((r) => r.state === 'Succeeded').length, 1)
    },
    { actor: opts.actor, lock: opts.lock }
  )
})

test('a refund needs a fresh step-up', async () => {
  await inPinnedTransaction(
    async (c) => {
      const sale = await aPaidSale(c)
      const stale = await aSessionRow(c, TEST_ACTOR.id, STEP_UP_FRESH_SECONDS + 60)
      const { calls, issue } = issuer('succeeded')
      await assert.rejects(
        refunds.refund(sale.order.id, { amount: 1, reason: 'no fresh step up here' }, stale, issue)
      )
      assert.equal(calls.length, 0)
    },
    { actor: opts.actor, lock: opts.lock }
  )
})

test('http: admin reads the refunds, a customer is refused, a bad body is 400', async () => {
  await inPinnedTransaction(
    async (c) => {
      const sale = await aPaidSale(c)
      await refunds.refund(
        sale.order.id,
        { amount: 5, reason: 'goodwill for the delay' },
        sale.session,
        issuer('succeeded').issue
      )
      await asAdmin(TEST_ACTOR, async () => {
        const list = await request(app).get(`/api/orders/${sale.order.id}/refunds`)
        assert.equal(list.status, 200, list.text)
        assert.equal(list.body.length, 1)
        assert.ok(RefundView.safeParse(list.body[0]).success)
        const bad = await request(app)
          .post(`/api/orders/${sale.order.id}/refunds`)
          .send({ amount: -1 })
        assert.equal(bad.status, 400)
      })
      await asUser({ id: sale.buyer.id, name: null, email: null }, async () => {
        const denied = await request(app).get(`/api/orders/${sale.order.id}/refunds`)
        assert.equal(denied.status, 403)
      })
    },
    { actor: opts.actor, lock: opts.lock }
  )
})
