import { test, afterAll } from 'vitest'
import assert from 'node:assert/strict'
import type { PoolClient } from 'pg'
import pool from '#pool'
import { TEST_ACTOR } from '#shared/testing/actor.ts'
import { inPinnedTransaction } from '#shared/testing/pinned-pool.ts'
import { anUnknownId, aUser, anOrder, aShipment } from '#shared/testing/builders/index.ts'
import { LOCKS } from '#shared/testing/locks.ts'
import { aSessionRow } from '#accounts/auth/tests/harness.ts'
import { STEP_UP_FRESH_SECONDS } from '#accounts/auth/rules.ts'
import * as paymentsService from '#transactions/service.ts'
import * as orders from '#orders/service.ts'
import * as orderLots from '#db/orders/lots/repo.ts'
import * as lotsRepo from '#db/inventory/lots/repo.ts'
import * as shipmentActions from '#logistics/shipping/shipments/actions.service.ts'

afterAll(async () => {
  await pool.end()
})

const opts = {
  actor: TEST_ACTOR.id,
  lock: [LOCKS.ORDERS, LOCKS.ADDRESSES, LOCKS.USERS, LOCKS.FULFILLMENTS],
}
const WHY = 'customer asked for a different coin'

const aSale = async (c: PoolClient, paid: boolean) => {
  const buyer = await aUser(c)
  const order = await anOrder(c, buyer, { direction: 'sale' }).withLots(1)
  const shipment = await aShipment(c, order)
  if (paid) {
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
  }
  return { order, shipment, line: order.lots[0]!.id }
}

const reasonsOf = async (c: PoolClient, order_id: string) =>
  (
    await c.query(
      `SELECT action, reason FROM orders.action_reasons WHERE order_id = $1 ORDER BY created_at`,
      [order_id]
    )
  ).rows

test('an unpaid sale edits with no reason and stores none', async () => {
  await inPinnedTransaction(
    async (c) => {
      const { order, shipment, line } = await aSale(c, false)
      await orders.editLot(line, { premium: 1.05 })
      await shipmentActions.chargeForOrder(shipment.id, 30)
      assert.deepEqual(await reasonsOf(c, order.id), [])
    },
    { actor: opts.actor, lock: opts.lock }
  )
})

test('a charged sale refuses a lot edit and a shipping charge without an override', async () => {
  await inPinnedTransaction(
    async (c) => {
      const { order, shipment, line } = await aSale(c, true)
      await assert.rejects(orders.editLot(line, { premium: 1.05 }), /has been charged/)
      await assert.rejects(shipmentActions.chargeForOrder(shipment.id, 30), /has been charged/)
      const stale = await aSessionRow(c, TEST_ACTOR.id, STEP_UP_FRESH_SECONDS + 60)
      await assert.rejects(orders.editLot(line, { premium: 1.05 }, null, WHY, stale))
      assert.deepEqual(await reasonsOf(c, order.id), [])
    },
    { actor: opts.actor, lock: opts.lock }
  )
})

test('a charged sale takes the edit with a reason and a fresh step-up, and keeps the reason', async () => {
  await inPinnedTransaction(
    async (c) => {
      const { order, shipment, line } = await aSale(c, true)
      const fresh = await aSessionRow(c, TEST_ACTOR.id, 0)
      await orders.editLot(line, { premium: 1.05 }, null, WHY, fresh)
      await shipmentActions.chargeForOrder(shipment.id, 30, WHY, fresh)
      assert.deepEqual(await reasonsOf(c, order.id), [
        { action: 'edit_lot', reason: WHY },
        { action: 'shipping_charge', reason: WHY },
      ])
    },
    { actor: opts.actor, lock: opts.lock }
  )
})

const aStockLine = async (c: PoolClient, order_id: string) => {
  const {
    rows: [stock],
  } = await c.query(
    `INSERT INTO inventory.lots (metal_id, pre_melt, purity, quantity, unit)
     VALUES ('Gold', 1, 0.9999, 1, 't oz') RETURNING id`
  )
  const minted = await orderLots.mintFromStock(order_id, stock.id, c)
  return { stock_id: stock.id as string, line: minted.id, minted_id: minted.lot_id }
}

const positionOf = async (lot_id: string) => (await lotsRepo.positionsOf([lot_id]))[0]?.position

test('an unpaid sale unlinks a stock line: the stock lot is on hand again and no lot is deleted', async () => {
  await inPinnedTransaction(
    async (c) => {
      const { order } = await aSale(c, false)
      const { stock_id, line, minted_id } = await aStockLine(c, order.id)
      assert.equal(await positionOf(stock_id), 'sold')

      await orders.unlinkLot(line, { reason: 'customer changed their mind' })

      assert.equal(await positionOf(stock_id), 'on hand', 'the stock lot was not released')
      assert.equal(await positionOf(minted_id), 'removed')
      const kept = await c.query('SELECT id FROM inventory.lots WHERE id = ANY($1::uuid[])', [
        [stock_id, minted_id],
      ])
      assert.equal(kept.rows.length, 2, 'an inventory lot was deleted')
      const edge = await c.query(
        `SELECT 1 FROM inventory.lot_sources WHERE lot_id = $1 AND kind = 'sale'`,
        [minted_id]
      )
      assert.equal(edge.rows.length, 1, 'the sale lineage edge was deleted')
      assert.deepEqual(await reasonsOf(c, order.id), [])
    },
    { actor: opts.actor, lock: opts.lock }
  )
})

test('a charged sale unlinks a line only with a reason and a fresh step-up, and keeps the reason', async () => {
  await inPinnedTransaction(
    async (c) => {
      const { order, line } = await aSale(c, true)
      await assert.rejects(
        orders.unlinkLot(line, { reason: 'customer changed their mind' }),
        /has been charged/
      )
      const stale = await aSessionRow(c, TEST_ACTOR.id, STEP_UP_FRESH_SECONDS + 60)
      await assert.rejects(
        orders.unlinkLot(line, { reason: 'customer changed', override_reason: WHY }, stale)
      )
      assert.deepEqual(await reasonsOf(c, order.id), [])

      const fresh = await aSessionRow(c, TEST_ACTOR.id, 0)
      const left = await orders.unlinkLot(
        line,
        { reason: 'customer changed', override_reason: WHY },
        fresh
      )
      assert.equal(left.length, 0)
      assert.deepEqual(await reasonsOf(c, order.id), [{ action: 'unlink_lot', reason: WHY }])
    },
    { actor: opts.actor, lock: opts.lock }
  )
})
