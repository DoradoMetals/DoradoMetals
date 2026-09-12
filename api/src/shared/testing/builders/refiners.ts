import type { PoolClient } from 'pg'
import * as refiningOrders from '#db/refining/orders/repo.ts'
import * as refiningLots from '#db/refining/lots/repo.ts'
import * as pool from '#db/refining/pool/repo.ts'
import type { BuiltOrder } from '#shared/testing/builders/orders.ts'
import type { RefiningDirection, RefiningLotPatch } from '@dorado/contracts'

export type BuiltRefiningOrder = {
  id: string
  number: number
  direction: RefiningDirection
  refiner_id: string
  lot_ids: string[]
}

export async function aRefiningOrder(
  c: PoolClient,
  order: BuiltOrder,
  options: {
    direction?: RefiningDirection
    assay?: RefiningLotPatch
    lock?: { metal_id: string; troy_oz: number; lock_price: number }
  } = {}
): Promise<BuiltRefiningOrder> {
  const { rows } = await c.query<{ id: string }>(
    `SELECT id FROM refiners.refiners ORDER BY id LIMIT 1`
  )
  const refiner_id = rows[0]?.id
  if (!refiner_id) throw new Error('refiners.refiners holds no counterparty to engage')

  const direction = options.direction ?? (order.direction === 'purchase' ? 'sell' : 'buy')
  const created = await refiningOrders.create({ refiner_id, direction }, c)
  const assigned = await refiningLots.assign(
    created.id,
    order.lots.map((lot) => lot.lot_id),
    c
  )
  if (options.assay) {
    for (const lot of assigned) await refiningLots.update(lot.id, options.assay, c)
  }
  if (options.lock) {
    await pool.lock(
      {
        refiner_id,
        metal_id: options.lock.metal_id,
        troy_oz: options.lock.troy_oz,
        lock_price: options.lock.lock_price,
        refining_order_id: created.id,
      },
      c
    )
  }

  return {
    id: created.id,
    number: created.number,
    direction,
    refiner_id,
    lot_ids: assigned.map((lot) => lot.lot_id),
  }
}
