import { test, afterAll } from 'vitest'
import assert from 'node:assert/strict'
import type { PoolClient } from 'pg'
import pool from '#pool'
import { inRollback } from '#shared/testing/rollback.ts'
import { TEST_ACTOR } from '#shared/testing/actor.ts'
import { LOCKS } from '#shared/testing/locks.ts'
import { aUser, anOrder } from '#shared/testing/builders/index.ts'
import * as lots from '#db/inventory/lots/repo.ts'
import * as refiningOrdersRepo from '#db/refining/orders/repo.ts'
import * as refiningLotsRepo from '#db/refining/lots/repo.ts'

afterAll(async () => {
  await pool.end()
})

const inPositions = <T>(fn: (c: PoolClient) => Promise<T>) =>
  inRollback(fn, { actor: TEST_ACTOR.id, lock: LOCKS.ORDERS })

const positionOf = async (c: PoolClient, lot_id: string): Promise<string | undefined> => {
  const [row] = await lots.positionsOf([lot_id], c)
  return row?.position
}

const aRefiner = async (c: PoolClient): Promise<string> => {
  const { rows } = await c.query<{ id: string }>('SELECT id FROM refiners.refiners LIMIT 1')
  assert.ok(rows[0], 'the test database has no refiner')
  return rows[0].id
}

test('incoming: a lot placed on a purchase order that has not been received', async () => {
  await inPositions(async (c) => {
    const order = await anOrder(c, await aUser(c), { direction: 'purchase' }).withLots(1)
    assert.equal(await positionOf(c, order.lots[0]!.lot_id), 'incoming')
  })
})

test('on hand: a lot that belongs to no order at all', async () => {
  await inPositions(async (c) => {
    const lot = await lots.create({ metal_id: 'Gold', pre_melt: 10, purity: 0.9 }, c)
    assert.equal(await positionOf(c, lot.id), 'on hand')
  })
})

test('on hand: a purchase order lot whose handover has reached its done state', async () => {
  await inPositions(async (c) => {
    const order = await anOrder(c, await aUser(c), { direction: 'purchase' })
      .withLots(1)
      .withFulfillment()
    await c.query(
      `UPDATE shipping.shipments s
          SET shipping_status = 'Delivered', delivered_at = now()
         FROM fulfillments.shipments fs
         JOIN fulfillments.fulfillments f ON f.id = fs.fulfillment_id
        WHERE fs.shipment_id = s.id AND f.order_id = $1`,
      [order.id]
    )
    assert.equal(await positionOf(c, order.lots[0]!.lot_id), 'on hand')
  })
})

test('at refiner: assigned to a refiner order that has been sent but not settled', async () => {
  await inPositions(async (c) => {
    const order = await anOrder(c, await aUser(c), { direction: 'purchase' }).withLots(1)
    const refiner_id = await aRefiner(c)
    const refiningOrder = await refiningOrdersRepo.create({ refiner_id, direction: 'sell' }, c)
    await refiningLotsRepo.assign(refiningOrder.id, [order.lots[0]!.lot_id], c)
    await refiningOrdersRepo.send(refiningOrder.id, c)

    assert.equal(await positionOf(c, order.lots[0]!.lot_id), 'at refiner')
  })
})

test('pooled: the refiner order that held it has settled', async () => {
  await inPositions(async (c) => {
    const order = await anOrder(c, await aUser(c), { direction: 'purchase' }).withLots(1)
    const refiner_id = await aRefiner(c)
    const refiningOrder = await refiningOrdersRepo.create({ refiner_id, direction: 'sell' }, c)
    await refiningLotsRepo.assign(refiningOrder.id, [order.lots[0]!.lot_id], c)
    await refiningOrdersRepo.send(refiningOrder.id, c)
    await c.query(`UPDATE refining.orders SET settled_at = now() WHERE id = $1`, [
      refiningOrder.id,
    ])

    assert.equal(await positionOf(c, order.lots[0]!.lot_id), 'pooled')
  })
})

test('sold: a lot placed on a sale order', async () => {
  await inPositions(async (c) => {
    const order = await anOrder(c, await aUser(c), { direction: 'sale' }).withLots(1)
    assert.equal(await positionOf(c, order.lots[0]!.lot_id), 'sold')
  })
})

test('consumed: a parent that a split gave children', async () => {
  await inPositions(async (c) => {
    const parent = await lots.create({ metal_id: 'Silver', pre_melt: 20, purity: 0.9 }, c)
    await lots.splitOff(parent.id, [{ pre_melt: 20, purity: 0.9 }], c)
    assert.equal(await positionOf(c, parent.id), 'consumed')
  })
})

test('consumed: a parent that a combine folded into a successor', async () => {
  await inPositions(async (c) => {
    const a = await lots.create({ metal_id: 'Silver', pre_melt: 10, purity: 0.9 }, c)
    const b = await lots.create({ metal_id: 'Silver', pre_melt: 10, purity: 0.9 }, c)
    const combined = await lots.combine([a.id, b.id], c)
    await lots.linkCombined([a.id, b.id], combined.id, c)

    assert.equal(await positionOf(c, a.id), 'consumed')
    assert.equal(await positionOf(c, b.id), 'consumed')
    assert.equal(await positionOf(c, combined.id), 'on hand')
  })
})
