import { z } from 'zod/v4'
import { Action } from '../computed/orders.js'

import { Lot, LotView } from '../lots/items.js'
import { Order } from '../orders/orders.js'
import { Spot } from '../spots/spots.js'
import { OrderLot } from '../orders/lots.js'
import { RefinerView } from '../refiners/refiners.js'
import { RefiningLot } from './lots.js'
import { RefiningOrder } from './orders.js'
import { PoolBalance } from './pool.js'

export const RefiningLotView = RefiningLot.extend({
  lot: LotView,
  order_id: Order.shape.id.nullable(),
  order_number: Order.shape.number.nullable(),
  order_direction: Order.shape.direction,
  customer_premium: OrderLot.shape.premium,
}).extend({ order_reference: z.string().nullable() })
export type RefiningLotView = z.infer<typeof RefiningLotView>

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
})
export type RefiningOrderView = z.infer<typeof RefiningOrderView>

export const RefiningOrderActions = z.array(Action)
export type RefiningOrderActions = z.infer<typeof RefiningOrderActions>

export const RefiningOrderRead = RefiningOrderView.extend({ actions: RefiningOrderActions })
export type RefiningOrderRead = z.infer<typeof RefiningOrderRead>

export const RefiningSpot = Spot.pick({ metal_id: true, ask: true, bid: true }).extend({
  ask: Spot.shape.ask.nullable(),
  locked: z.boolean(),
})
export type RefiningSpot = z.infer<typeof RefiningSpot>
