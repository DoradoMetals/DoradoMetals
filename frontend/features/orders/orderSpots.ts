// Order-locked spots: the ORDERS wire's shape, and the edge that converts it.
//
// An order freezes the metal prices it was quoted at. Those rows live in
// exchange.order_metals and travel on the ORDERS endpoints - embedded in
// order responses, returned by get_order_metals, sent back up by update_spot
// and lock_spots - so they speak the orders wire's LEGACY names
// (`type` / `ask_spot` / `bid_spot`) even though the live spot feed has
// converted to the schema's own names (`name` / `ask` / `bid`).
//
// This file is that seam. Reads map UP at the query edge so every component
// and pricing util speaks the converted shape only; the three mutations that
// send spots map DOWN because the API reads `spot.type` / `spot.bid_spot`
// out of those bodies (purchase-orders updateSpot and updateOrderMetals, the
// supplier email's PDF). THE WHOLE FILE DIES WITH THE ORDERS CONVERSION -
// when the orders wire serves the new names there is nothing left to map.
import { z } from 'zod'
import type { SpotPrice } from '@/features/spots/types'

// What an order spot adds to a live quote: which order froze it, and when.
export type OrderSpot = SpotPrice & {
  purchase_order_id?: string
  sales_order_id?: string
  created_at?: string
  updated_at?: string
}

// The wire row as the orders endpoints serve and accept it - legacy names.
export const orderSpotWireSchema = z.object({
  id: z.string(),
  purchase_order_id: z.string().optional(),
  sales_order_id: z.string().optional(),
  type: z.string(),
  ask_spot: z.number(),
  bid_spot: z.number(),
  percent_change: z.number(),
  dollar_change: z.number(),
  created_at: z.string().optional(),
  updated_at: z.string().optional(),
})
export type OrderSpotWire = z.infer<typeof orderSpotWireSchema>

export function orderSpotFromWire(w: OrderSpotWire): OrderSpot {
  const { type, ask_spot, bid_spot, ...rest } = w
  return { ...rest, name: type, ask: ask_spot, bid: bid_spot }
}

export function orderSpotToWire(s: OrderSpot | SpotPrice): OrderSpotWire {
  const { name, ask, bid, ...rest } = s
  // ask/bid are nullable on the live shape; the orders wire has always
  // carried numbers, and a null here would price an order at nothing.
  return { ...rest, type: name, ask_spot: ask ?? 0, bid_spot: bid ?? 0 } as OrderSpotWire
}
