import { z } from 'zod/v4'
import { Order } from '../orders/orders.js'
import { Metal } from '../metals/metals.js'

export const ProfitParty = z.enum(['customer', 'dorado', 'refiner'])
export type ProfitParty = z.infer<typeof ProfitParty>

export const ProfitCategory = z.enum(['scrap', 'bullion', 'total'])
export type ProfitCategory = z.infer<typeof ProfitCategory>

export const ProfitShare = z.object({
  party: ProfitParty,
  category: ProfitCategory,
  metal_id: Metal.shape.id,
  content: z.number(),
  percentage: z.number(),
  profit: z.number(),
})
export type ProfitShare = z.infer<typeof ProfitShare>

export const ProfitPartyTotal = z.object({
  party: ProfitParty,
  metals_profit: z.number(),
  shipping_net: z.number(),
  refiner_fee_net: z.number(),
  spot_net: z.number(),
  total_profit: z.number(),
})
export type ProfitPartyTotal = z.infer<typeof ProfitPartyTotal>

export const ProfitBasis = z.enum(['realized', 'estimated'])
export type ProfitBasis = z.infer<typeof ProfitBasis>

export const ProfitLot = z.object({
  lot_id: z.string().uuid(),
  reference: z.string(),
  metal_id: Metal.shape.id,
  settled_at: z.string().nullable(),
  settled_spot: z.number().nullable(),
  value: z.number(),
  estimated: z.boolean(),
})
export type ProfitLot = z.infer<typeof ProfitLot>

export const ProfitBreakdown = z.object({
  order_id: Order.shape.id,
  spots_at: z.string(),
  basis: ProfitBasis,
  settled_lots: z.number().int(),
  total_lots: z.number().int(),
  payout: z.number(),
  fees: z.number(),
  lots: z.array(ProfitLot),
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
