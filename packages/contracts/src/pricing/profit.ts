import { z } from "zod/v4";
import { Order } from "../orders/orders.js";

export const ProfitMetal = z.object({
  content: z.number(),
  percentage: z.number(),
  profit: z.number(),
});
export type ProfitMetal = z.infer<typeof ProfitMetal>;

export const ProfitMetalsDict = z.object({
  gold: ProfitMetal,
  silver: ProfitMetal,
  platinum: ProfitMetal,
  palladium: ProfitMetal,
});
export type ProfitMetalsDict = z.infer<typeof ProfitMetalsDict>;

export const ProfitCategoriesDict = z.object({
  scrap: ProfitMetalsDict,
  bullion: ProfitMetalsDict,
  total: ProfitMetalsDict,
  shipping_net: z.number(),
  refiner_fee_net: z.number(),
  spot_net: z.number(),
  total_profit: z.number(),
});
export type ProfitCategoriesDict = z.infer<typeof ProfitCategoriesDict>;

export const ProfitBreakdown = z.object({
  order_id: Order.shape.id,
  spots_at: z.string(),
  refiner: ProfitCategoriesDict,
  dorado: ProfitCategoriesDict,
  customer: ProfitCategoriesDict,
});
export type ProfitBreakdown = z.infer<typeof ProfitBreakdown>;

export const OrderQuoteBody = z.object({
  order_id: Order.shape.id,
}).strict();
export type OrderQuoteBody = z.infer<typeof OrderQuoteBody>;
