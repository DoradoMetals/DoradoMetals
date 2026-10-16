import { test, afterAll, vi } from 'vitest'
import assert from 'node:assert/strict'
import pool from '#pool'
import { TEST_ACTOR } from '#shared/testing/actor.ts'
import { inPinnedTransaction } from '#shared/testing/pinned-pool.ts'
import { anUnknownId, aUser, anOrder } from '#shared/testing/builders/index.ts'
import { LOCKS } from '#shared/testing/locks.ts'
import * as paymentsService from '#transactions/service.ts'
import * as orders from '#orders/service.ts'
import * as orderRead from '#orders/read.ts'

vi.mock('#orders/read.ts', async (importOriginal) => {
  const real = await importOriginal<typeof import('#orders/read.ts')>()
  return {
    ...real,
    view: async (order_id: string, executor?: Parameters<typeof real.view>[1]) => {
      const seen = await real.view(order_id, executor)
      if (executor !== undefined || !seen) return seen
      return {
        ...seen,
        payment: { ...seen.payment, received: 0, refundable: 0, charge_received: false },
      }
    },
  }
})

afterAll(async () => {
  await pool.end()
})

test('a settlement that lands after the first read is refused under the order lock', async () => {
  await inPinnedTransaction(
    async (c) => {
      const buyer = await aUser(c)
      const order = await anOrder(c, buyer, { direction: 'sale' }).withLots(1)
      const ref = `pi_${anUnknownId().slice(0, 24)}`
      const intent = { id: ref, status: 'succeeded', amount: 10000, amount_received: 10000 }
      await paymentsService.recordIntent(
        intent,
        { session_id: anUnknownId(), user_id: buyer.id },
        'sales_order_checkout',
        undefined,
        c
      )
      await paymentsService.attachOrder(ref, order.id, c)
      await paymentsService.updateFromProvider(intent, c)

      await assert.rejects(
        orders.cancelSale(
          order.id,
          { reason: 'customer changed their mind' },
          {
            openIntentRefFor: async () => null,
            cancelIntent: async () => undefined,
            voidLabel: async () => undefined,
          }
        ),
        /refund the money first/
      )
      const row = await c.query(`SELECT cancelled_at FROM orders.orders WHERE id = $1`, [order.id])
      assert.equal(row.rows[0].cancelled_at, null)
    },
    { actor: TEST_ACTOR.id, lock: [LOCKS.ORDERS, LOCKS.USERS, LOCKS.FULFILLMENTS] }
  )
})

test('a settlement that commits after the cancel still lands, and lands refundable', async () => {
  await inPinnedTransaction(
    async (c) => {
      const buyer = await aUser(c)
      const order = await anOrder(c, buyer, { direction: 'sale' }).withLots(1)
      const ref = `pi_${anUnknownId().slice(0, 24)}`
      const open = { id: ref, status: 'requires_payment_method', amount: 10000 }
      await paymentsService.recordIntent(
        open,
        { session_id: anUnknownId(), user_id: buyer.id },
        'sales_order_checkout',
        undefined,
        c
      )
      await paymentsService.attachOrder(ref, order.id, c)

      const view = await orders.cancelSale(
        order.id,
        { reason: 'customer changed their mind' },
        {
          openIntentRefFor: async () => null,
          cancelIntent: async () => undefined,
          voidLabel: async () => undefined,
        }
      )
      assert.ok(view.order.cancelled_at)

      await paymentsService.updateFromProvider(
        { id: ref, status: 'succeeded', amount: 10000, amount_received: 10000 },
        c
      )
      const after = await orderRead.view(order.id, c)
      assert.equal(after!.payment.received, 100)
      assert.equal(after!.payment.refundable, 100, 'the late charge cannot be refunded')
    },
    { actor: TEST_ACTOR.id, lock: [LOCKS.ORDERS, LOCKS.USERS, LOCKS.FULFILLMENTS] }
  )
})
