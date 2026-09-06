import { z } from 'zod/v4'

import { Lot, LotView } from '../lots/items.js'
import { Order } from '../orders/orders.js'
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
})
export type RefiningLotView = z.infer<typeof RefiningLotView>

// `state` is a label - Pending assay, Settled, Disputed - and drives nothing;
// the timestamps do. The three settlement figures are sums over the lots.
export const RefiningOrderView = RefiningOrder.extend({
  state: RefiningOrder.shape.assay_lab.unwrap(),
  refiner: RefinerView.nullable(),
  lots: z.array(RefiningLotView),
  pool: z.array(PoolBalance),
  estimated_content: Lot.shape.content,
  settled_content: Lot.shape.content,
  variance: Lot.shape.content,
  pool_oz: Lot.shape.content,
})
export type RefiningOrderView = z.infer<typeof RefiningOrderView>
