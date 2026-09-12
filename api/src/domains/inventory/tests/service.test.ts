import { test, afterAll } from 'vitest'
import assert from 'node:assert/strict'
import type { PoolClient } from 'pg'
import pool from '#pool'
import { inPinnedTransaction } from '#shared/testing/pinned-pool.ts'
import { TEST_ACTOR } from '#shared/testing/actor.ts'
import { LOCKS } from '#shared/testing/locks.ts'
import { aUser, anOrder } from '#shared/testing/builders/index.ts'
import * as inventory from '#inventory/service.ts'
import * as lotSources from '#db/inventory/lot-sources/repo.ts'
import * as refiningOrdersRepo from '#db/refining/orders/repo.ts'
import * as refiningLotsRepo from '#db/refining/lots/repo.ts'

// `split` moved here from orders.splitLot (ruling 113). POST
// /api/orders/lots/:id/split still calls the old function until the lead
// repoints it, so this exercises the new use case at the service layer
// rather than through that URL.

afterAll(async () => {
  await pool.end()
})

const inSplit = <T>(fn: (c: PoolClient) => Promise<T>) =>
  inPinnedTransaction(fn, { actor: TEST_ACTOR.id, lock: LOCKS.ORDERS })

const aRefiner = async (c: PoolClient): Promise<string> => {
  const { rows } = await c.query<{ id: string }>('SELECT id FROM refiners.refiners LIMIT 1')
  assert.ok(rows[0], 'the test database has no refiner')
  return rows[0].id
}

test('an incoming lot can be split, and retiers the order it stays on', async () => {
  await inSplit(async (c) => {
    const order = await anOrder(c, await aUser(c), { direction: 'purchase' }).withLots(1, {
      metal_id: 'Gold',
      pre_melt: 10,
      purity: 0.9,
    })

    const view = await inventory.split(order.lots[0]!.id, [
      { pre_melt: 6, purity: 0.9 },
      { pre_melt: 4, purity: 0.9 },
    ])
    assert.equal(view.length, 3, 'the parent link plus its two children')

    const childIds = view.map((row) => row.lot.id).filter((id) => id !== order.lots[0]!.lot_id)
    assert.equal(childIds.length, 2)
    for (const childId of childIds) {
      const edges = await lotSources.getFor(childId, c)
      assert.ok(
        edges.some(
          (edge) => edge.source_lot_id === order.lots[0]!.lot_id && edge.kind === 'split'
        ),
        `child ${childId} has no split edge to the parent`
      )
    }
  })
})

test('an on-hand lot (no order) can be split through its own link once one is minted', async () => {
  await inSplit(async (c) => {
    const order = await anOrder(c, await aUser(c), { direction: 'purchase' })
      .withLots(1, { metal_id: 'Silver', pre_melt: 20, purity: 0.5 })
      .withFulfillment()
    await c.query(
      `UPDATE shipping.shipments s
          SET shipping_status = 'Delivered', delivered_at = now()
         FROM fulfillments.shipments fs
         JOIN fulfillments.fulfillments f ON f.id = fs.fulfillment_id
        WHERE fs.shipment_id = s.id AND f.order_id = $1`,
      [order.id]
    )

    const view = await inventory.split(order.lots[0]!.id, [
      { pre_melt: 12, purity: 0.5 },
      { pre_melt: 8, purity: 0.5 },
    ])
    assert.equal(view.length, 3, 'the parent link plus its two children')
  })
})

test('a lot at refiner refuses to split, and an unknown order lot is a 404', async () => {
  await inSplit(async (c) => {
    const order = await anOrder(c, await aUser(c), { direction: 'purchase' }).withLots(1, {
      metal_id: 'Gold',
      pre_melt: 10,
      purity: 0.9,
    })
    const refiner_id = await aRefiner(c)
    const refiningOrder = await refiningOrdersRepo.create({ refiner_id, direction: 'sell' }, c)
    await refiningLotsRepo.assign(refiningOrder.id, [order.lots[0]!.lot_id], c)
    await refiningOrdersRepo.send(refiningOrder.id, c)

    await assert.rejects(
      inventory.split(order.lots[0]!.id, [{ pre_melt: 5, purity: 0.9 }]),
      /at refiner.*cannot be split/
    )

    await assert.rejects(
      inventory.split('00000000-0000-4000-8000-000000000000', [{ pre_melt: 5, purity: 0.9 }]),
      /no order lot/
    )
  })
})

test('a sale-order lot refuses to split', async () => {
  await inSplit(async (c) => {
    const order = await anOrder(c, await aUser(c), { direction: 'sale' }).withLots(1, {
      metal_id: 'Gold',
      pre_melt: 5,
      purity: 0.9,
    })

    await assert.rejects(
      inventory.split(order.lots[0]!.id, [{ pre_melt: 5, purity: 0.9 }]),
      /sold.*cannot be split/
    )
  })
})
