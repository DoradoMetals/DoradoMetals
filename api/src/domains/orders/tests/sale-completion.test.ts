import { test, afterAll } from 'vitest'
import assert from 'node:assert/strict'
import type { PoolClient } from 'pg'
import pool from '#pool'
import { TEST_ACTOR } from '#shared/testing/actor.ts'
import { inPinnedTransaction } from '#shared/testing/pinned-pool.ts'
import { anUnknownId, aUser, anOrder, aShipment } from '#shared/testing/builders/index.ts'
import { LOCKS } from '#shared/testing/locks.ts'
import * as paymentsService from '#transactions/service.ts'
import * as orderRead from '#orders/read.ts'

afterAll(async () => {
  await pool.end()
})

const opts = {
  actor: TEST_ACTOR.id,
  lock: [LOCKS.ORDERS, LOCKS.ADDRESSES, LOCKS.USERS, LOCKS.FULFILLMENTS],
}

const pay = async (c: PoolClient, user_id: string, order_id: string) => {
  const ref = `pi_${anUnknownId().slice(0, 24)}`
  const intent = { id: ref, status: 'succeeded', amount: 10000, amount_received: 10000 }
  await paymentsService.recordIntent(
    intent,
    { session_id: anUnknownId(), user_id },
    'sales_order_checkout',
    undefined,
    c
  )
  await paymentsService.attachOrder(ref, order_id, c)
  await paymentsService.updateFromProvider(intent, c)
}

test('a sale closes when it is paid and its parcel is delivered, not before (ruling 134)', async () => {
  await inPinnedTransaction(
    async (c) => {
      const buyer = await aUser(c)
      const order = await anOrder(c, buyer, { direction: 'sale' }).withLots(1)
      const shipment = await aShipment(c, order)
      await pay(c, buyer.id, order.id)

      await c.query(`UPDATE shipping.shipments SET shipped_at = now() WHERE id = $1`, [shipment.id])
      const moving = await orderRead.view(order.id)
      assert.equal(moving!.state, 'In Transit')
      assert.equal(moving!.completed_at, null)
      assert.ok(!moving!.actions.some((a) => a.name === 'cancel'), 'a shipped sale offered cancel')

      await c.query(
        `UPDATE shipping.shipments SET delivered_at = '2026-10-01T12:00:00Z' WHERE id = $1`,
        [shipment.id]
      )
      const closed = await orderRead.view(order.id)
      assert.equal(closed!.state, 'Completed')
      assert.ok(closed!.completed_at)
    },
    { actor: opts.actor, lock: opts.lock }
  )
})
