import { z } from 'zod/v4'

import { Lot, LotView } from '../lots/items.js'
import { Order } from '../orders/orders.js'
import { Spot } from '../spots/spots.js'
import { OrderLot } from '../orders/lots.js'
import { RefinerView } from '../refiners/refiners.js'
import { RefiningLot } from './lots.js'
import { RefiningOrder } from './orders.js'
import { PoolBalance } from './pool.js'

// The refiner's side of a lot beside the customer's: the order the metal came
// off, and what Dorado paid for it. That pairing is the margin, and it is one
// SQL read. It lives here because it is the one shape that spans both orders,
// and importing it from either side would close a cycle.
export const RefiningLotView = RefiningLot.extend({
  lot: LotView,
  order_id: Order.shape.id.nullable(),
  order_number: Order.shape.number.nullable(),
  order_direction: Order.shape.direction,
  customer_premium: OrderLot.shape.premium,
}).extend({ order_reference: z.string().nullable() })
export type RefiningLotView = z.infer<typeof RefiningLotView>

// A refiner order's Charges card. It has no orders.transactions row: the fee is
// its own column, the remediation is the money value of the pool locks citing
// it, and the payment charge is the flat fee of the rail its transfer moves on.
export const RefiningTotals = z.object({
  fee: RefiningOrder.shape.fee,
  pool_remediation: RefiningOrder.shape.fee,
  payment_charge: RefiningOrder.shape.fee,
  total: RefiningOrder.shape.fee,
})
export type RefiningTotals = z.infer<typeof RefiningTotals>

// `state` is a label - Pending assay, Settled, Disputed, Cancelled - and drives
// nothing; the timestamps do. Every figure below is a sum over the lots.
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
  // The Settlement card's big figure: the metal's money, not its ounces.
  expected_settlement: RefiningOrder.shape.fee,
  orders_to_date: z.number().int(),
})
export type RefiningOrderView = z.infer<typeof RefiningOrderView>

// A refiner order's four frozen prices. `bid` is the pool's last lock for that
// refiner and metal - the price the metal actually changed hands at - falling
// back to the live bid, which is what `locked` reports.
export const RefiningSpot = Spot.pick({ metal_id: true, ask: true, bid: true }).extend({
  ask: Spot.shape.ask.nullable(),
  locked: z.boolean(),
})
export type RefiningSpot = z.infer<typeof RefiningSpot>
