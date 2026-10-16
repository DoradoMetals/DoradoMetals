import { test, afterAll } from 'vitest'
import assert from 'node:assert/strict'
import type { PoolClient } from 'pg'
import pool from '#pool'
import { TEST_ACTOR } from '#shared/testing/actor.ts'
import { inPinnedTransaction } from '#shared/testing/pinned-pool.ts'
import { anUnknownId, aUser, anOrder } from '#shared/testing/builders/index.ts'
import { LOCKS } from '#shared/testing/locks.ts'
import * as paymentsService from '#transactions/service.ts'
import * as credit from '#transactions/credit/service.ts'
import * as orders from '#orders/service.ts'
import * as orderRead from '#orders/read.ts'

afterAll(async () => {
  await pool.end()
})

const opts = {
  actor: TEST_ACTOR.id,
  lock: [LOCKS.ORDERS, LOCKS.ADDRESSES, LOCKS.USERS, LOCKS.FULFILLMENTS],
}
const REASON = 'customer changed their mind'
const quiet: typeof orders.SALE_CANCEL_WORLD = {
  openIntentRefFor: async () => null,
  cancelIntent: async () => undefined,
  voidLabel: async () => undefined,
}

const balanceOf = async (c: PoolClient, user_id: string): Promise<number> =>
  Number(
    (await c.query(`SELECT dorado_funds FROM auth.users WHERE id = $1`, [user_id])).rows[0]
      .dorado_funds
  )

const ledgerOf = async (c: PoolClient, order_id: string) =>
  (
    await c.query(
      `SELECT type, amount::float AS amount FROM payments.ledger WHERE order_id = $1 ORDER BY type`,
      [order_id]
    )
  ).rows

const aCreditPaidSale = async (c: PoolClient, funds: number, used: number) => {
  const buyer = await aUser(c, { funds })
  const order = await anOrder(c, buyer, { direction: 'sale' }).withLots(1)
  await credit.reserve(buyer.id, used, order.id, c)
  assert.ok(await credit.settleReservation(order.id, c))
  return { buyer, order }
}

const payByCard = async (c: PoolClient, buyer: { id: string }, order_id: string) => {
  const ref = `pi_${anUnknownId().slice(0, 24)}`
  const intent = { id: ref, status: 'succeeded', amount: 10000, amount_received: 10000 }
  await paymentsService.recordIntent(
    intent,
    { session_id: anUnknownId(), user_id: buyer.id },
    'sales_order_checkout',
    undefined,
    c
  )
  await paymentsService.attachOrder(ref, order_id, c)
  await paymentsService.updateFromProvider(intent, c)
  return ref
}

test('a credit-only sale cancel gives the debited credit back to the balance', async () => {
  await inPinnedTransaction(
    async (c) => {
      const { buyer, order } = await aCreditPaidSale(c, 80, 50)
      assert.equal(await balanceOf(c, buyer.id), 30)
      const before = await orderRead.view(order.id)
      assert.equal(before!.payment.received, 50)
      assert.equal(before!.payment.credit, 50)
      assert.ok(
        before!.actions.some((a) => a.name === 'cancel'),
        'cancel was not offered'
      )

      const view = await orders.cancelSale(order.id, { reason: REASON }, quiet)
      assert.ok(view.order.cancelled_at)
      assert.equal(await balanceOf(c, buyer.id), 80)
      assert.deepEqual(await ledgerOf(c, order.id), [
        { type: 'Credit Refund', amount: 50 },
        { type: 'Debit', amount: 50 },
      ])
      assert.equal(view.payment.refunded, 50)
      assert.equal(view.payment.credit, 0)
    },
    { actor: opts.actor, lock: opts.lock }
  )
})

test('a mixed sale is refused until the card part is refunded, then cancel returns the credit part', async () => {
  await inPinnedTransaction(
    async (c) => {
      const { buyer, order } = await aCreditPaidSale(c, 30, 30)
      const ref = await payByCard(c, buyer, order.id)

      await assert.rejects(
        orders.cancelSale(order.id, { reason: REASON }, quiet),
        /refund the money first/
      )
      assert.equal(await balanceOf(c, buyer.id), 0)

      await c.query(
        `INSERT INTO payments.refunds (order_id, rail, provider, payment_ref, amount, reason, state, provider_ref, refunded_at)
       VALUES ($1, 'CARD', 'stripe', $2, 100, 'card part back', 'Succeeded', 're_test', now())`,
        [order.id, ref]
      )
      const view = await orders.cancelSale(order.id, { reason: REASON }, quiet)
      assert.ok(view.order.cancelled_at)
      assert.equal(await balanceOf(c, buyer.id), 30)
      assert.deepEqual(await ledgerOf(c, order.id), [
        { type: 'Credit Refund', amount: 30 },
        { type: 'Debit', amount: 30 },
      ])
    },
    { actor: opts.actor, lock: opts.lock }
  )
})
