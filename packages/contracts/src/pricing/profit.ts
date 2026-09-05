import { z } from 'zod/v4'
import { Order } from '../orders/orders.js'
import { Metal } from '../metals/metals.js'

// The admin margin report for one purchase order. It is ROWS, not a
// dictionary: `api/src/db/pricing/sql/profit_breakdown.sql` returns this whole
// object as one jsonb, and nothing in TypeScript assembles it (ruling 78).
//
// The old shape carried a fixed `{ gold, silver, platinum, palladium }` object
// per party per category - twelve objects, four metals always present and
// usually zero, behind a hardcoded metal list that ruling 79 made redundant
// the day `metals.metals.id` became the metal's own name. A metal appears
// here when the order has a line in it, and not otherwise.

// The three parties an order's fine metal is split between. A closed business
// set, not a table: nothing joins it and nothing stores it.
export const ProfitParty = z.enum(['customer', 'dorado', 'refiner'])
export type ProfitParty = z.infer<typeof ProfitParty>

// The kinds of line the split is reported over. `total` is both kinds
// together, and is not the sum of the other two rows unless a metal appears
// in both.
export const ProfitCategory = z.enum(['scrap', 'bullion', 'total'])
export type ProfitCategory = z.infer<typeof ProfitCategory>

// One party's stake in one metal within one category: the fine troy ounces it
// owns, that as a share of the metal's ounces across all three parties, and
// what those ounces are worth at the spot THAT party settles against - the
// customer at the order's own frozen bid, Dorado and the refiner at the
// refiner's.
export const ProfitShare = z.object({
  party: ProfitParty,
  category: ProfitCategory,
  metal_id: Metal.shape.id,
  content: z.number(),
  percentage: z.number(),
  profit: z.number(),
})
export type ProfitShare = z.infer<typeof ProfitShare>

// What one party walks away with, and the four numbers that make it.
// `total_profit` is `metals_profit + spot_net + shipping_net + refiner_fee_net`
// for the customer and for Dorado; the refiner's is its metal alone.
export const ProfitPartyTotal = z.object({
  party: ProfitParty,
  metals_profit: z.number(),
  shipping_net: z.number(),
  refiner_fee_net: z.number(),
  spot_net: z.number(),
  total_profit: z.number(),
})
export type ProfitPartyTotal = z.infer<typeof ProfitPartyTotal>

export const ProfitBreakdown = z.object({
  order_id: Order.shape.id,
  spots_at: z.string(),
  shares: z.array(ProfitShare),
  parties: z.array(ProfitPartyTotal),
})
export type ProfitBreakdown = z.infer<typeof ProfitBreakdown>

export const OrderQuoteBody = z
  .object({
    order_id: Order.shape.id,
  })
  .strict()
export type OrderQuoteBody = z.infer<typeof OrderQuoteBody>
