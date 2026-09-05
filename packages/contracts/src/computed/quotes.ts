import { z } from "zod/v4";

export const PricingSpot = z.object({
  name: z.string().nullable().optional(),
  ask: z.number().nullable().optional(),
  bid: z.number().nullable().optional(),
});
export type PricingSpot = z.infer<typeof PricingSpot>;

export const Spots = z.array(PricingSpot).nullable().optional();
export type Spots = z.infer<typeof Spots>;

export const Bids = z.map(z.string(), z.number().nullable());
export type Bids = z.infer<typeof Bids>;

export const CatalogQuoteLine = z.object({
  id: z.string().uuid(),
  quantity: z.number(),
  unit_price: z.number(),
  line_total: z.number(),
});
export type CatalogQuoteLine = z.infer<typeof CatalogQuoteLine>;

export const CatalogQuote = z.object({
  side: z.enum(["ask", "bid"]),
  spots_at: z.string(),
  items: z.array(CatalogQuoteLine),
  total: z.number(),
});
export type CatalogQuote = z.infer<typeof CatalogQuote>;

export const SalesOrderQuoteLine = z.object({
  id: z.string().uuid(),
  quantity: z.number(),
  unit_ask: z.number(),
  line_total: z.number(),
  sales_tax_rate: z.number(),
});
export type SalesOrderQuoteLine = z.infer<typeof SalesOrderQuoteLine>;

export const PaymentSurface = z.enum(["card", "credit"]);
export type PaymentSurface = z.infer<typeof PaymentSurface>;

export const SalesOrderQuote = z.object({
  spots_at: z.string(),
  item_total: z.number(),
  base_total: z.number(),
  shipping_charge: z.number(),
  beginning_funds: z.number(),
  ending_funds: z.number(),
  pre_charges_amount: z.number(),
  subject_to_charges_amount: z.number(),
  post_charges_amount: z.number(),
  charges_amount: z.number(),
  sales_tax: z.number(),
  order_total: z.number(),
  payment_surface: PaymentSurface,
  items: z.array(SalesOrderQuoteLine),
});
export type SalesOrderQuote = z.infer<typeof SalesOrderQuote>;

export const OrderPrices = SalesOrderQuote.omit({
  spots_at: true, payment_surface: true, items: true,
});
export type OrderPrices = z.infer<typeof OrderPrices>;

export const PurchaseOrderQuoteLine = z.object({
  id: z.string().uuid(),
  kind: z.enum(["product", "scrap"]),
  metal: z.string(),
  content: z.number(),
  premium: z.number(),
  unit_price: z.number(),
  line_total: z.number(),
});
export type PurchaseOrderQuoteLine = z.infer<typeof PurchaseOrderQuoteLine>;

export const PurchaseOrderQuote = z.object({
  spots_at: z.string(),
  items: z.array(PurchaseOrderQuoteLine),
  total: z.number(),
  declared_value: z.number(),
  shipping_charge: z.number(),
  payout_charge: z.number(),
  estimated_payout: z.number(),
});
export type PurchaseOrderQuote = z.infer<typeof PurchaseOrderQuote>;

export const OrderQuoteLine = z.object({
  id: z.string().uuid(),
  kind: z.enum(["product", "scrap"]),
  source: z.enum(["stored", "estimate"]),
  premium: z.number(),
  unit_price: z.number(),
  line_total: z.number(),
});
export type OrderQuoteLine = z.infer<typeof OrderQuoteLine>;

export const OrderQuote = z.object({
  order_id: z.string().uuid(),
  spots_at: z.string(),
  items: z.array(OrderQuoteLine),
  scrap_total: z.number(),
  bullion_total: z.number(),
  total: z.number(),
});
export type OrderQuote = z.infer<typeof OrderQuote>;

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
  order_id: z.string().uuid(),
  spots_at: z.string(),
  refiner: ProfitCategoriesDict,
  dorado: ProfitCategoriesDict,
  customer: ProfitCategoriesDict,
});
export type ProfitBreakdown = z.infer<typeof ProfitBreakdown>;

export const QuoteItem = z.object({
  id: z.string().uuid(),
  quantity: z.number().optional(),
}).strict();
export type QuoteItem = z.infer<typeof QuoteItem>;

export const CatalogQuoteBody = z.object({
  side: z.enum(["ask", "bid"]),
  items: z.array(QuoteItem).min(1),
}).strict();
export type CatalogQuoteBody = z.infer<typeof CatalogQuoteBody>;

export const OrderQuoteBody = z.object({
  order_id: z.string().uuid(),
}).strict();
export type OrderQuoteBody = z.infer<typeof OrderQuoteBody>;

export const PriceableLine = z.object({
  metal_type: z.string().nullable().optional(),
  content: z.number().nullable().optional(),
  ask_premium: z.number().nullable().optional(),
  quantity: z.number().nullable().optional(),
});
export type PriceableLine = z.infer<typeof PriceableLine>;
