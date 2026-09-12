import { z } from 'zod/v4'
import { Action } from '../computed/orders.js'

import { Lot, LotView, Position } from '../inventory/lots.js'
import { Order } from '../orders/orders.js'
import { Spot } from '../spots/spots.js'
import { RefinerView } from '../refiners/refiners.js'
import { LotEdge } from '../inventory/lot_sources.js'
import { RefiningLot } from './lots.js'
import { RefiningOrder } from './orders.js'
import { PoolBalance } from '../inventory/pool.js'

export const RefiningLotView = RefiningLot.extend({
  lot: LotView,
  sources: z.array(LotEdge),
  order_id: Order.shape.id.nullable(),
  order_number: Order.shape.number.nullable(),
  order_direction: Order.shape.direction,
  customer_premium: Lot.shape.premium,
}).extend({ order_reference: z.string().nullable() })
export type RefiningLotView = z.infer<typeof RefiningLotView>

export const RefiningLinkedOrder = z
  .object({
    id: Order.shape.id,
    number: Order.shape.number,
    direction: Order.shape.direction,
  })
  .extend({ reference: z.string() })
export type RefiningLinkedOrder = z.infer<typeof RefiningLinkedOrder>

export const RefiningTotals = z.object({
  fee: RefiningOrder.shape.fee,
  pool_remediation: RefiningOrder.shape.fee,
  payment_charge: RefiningOrder.shape.fee,
  total: RefiningOrder.shape.fee,
})
export type RefiningTotals = z.infer<typeof RefiningTotals>

export const RefiningOrderView = RefiningOrder.extend({
  state: RefiningOrder.shape.assay_lab.unwrap(),
  refiner: RefinerView.nullable(),
  lots: z.array(RefiningLotView),
  pool: z.array(PoolBalance),
  estimated_content: Lot.shape.content,
  settled_content: Lot.shape.content,
  variance: Lot.shape.content,
  pool_oz: Lot.shape.content,
}).extend({
  totals: RefiningTotals,
  expected_settlement: RefiningOrder.shape.fee,
  orders_to_date: z.number().int(),
  linked_orders: z.array(RefiningLinkedOrder),
})
export type RefiningOrderView = z.infer<typeof RefiningOrderView>

export const RefiningOrderActions = z.array(Action)
export type RefiningOrderActions = z.infer<typeof RefiningOrderActions>

export const RefiningOrderRead = RefiningOrderView.extend({ actions: RefiningOrderActions })
export type RefiningOrderRead = z.infer<typeof RefiningOrderRead>

export const RefiningSpot = Spot.pick({ metal_id: true }).extend({
  spot: Spot.shape.bid.nullable(),
  lots: z.number().int(),
  settled_lots: z.number().int(),
})
export type RefiningSpot = z.infer<typeof RefiningSpot>

export const RefiningBatchSkip = z.object({ lot_id: Lot.shape.id }).extend({ position: Position })
export type RefiningBatchSkip = z.infer<typeof RefiningBatchSkip>

export const RefiningBatchResult = z.object({}).extend({
  order: RefiningOrderRead,
  taken: z.number().int(),
  skipped: z.array(RefiningBatchSkip),
})
export type RefiningBatchResult = z.infer<typeof RefiningBatchResult>
