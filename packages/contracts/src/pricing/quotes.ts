import { z } from "zod/v4";
import { Direction } from "../orders/enums.js";
import { Bullion } from "../products/bullion.js";
import { Checkout } from "../checkout/checkouts.js";
import { CheckoutItem } from "../checkout/items.js";
import { Order } from "../orders/orders.js";
import { OrderItem } from "../orders/items.js";
import { Metal } from "../metals/metals.js";

export const PriceSide = z.enum(["ask", "bid"]);
export type PriceSide = z.infer<typeof PriceSide>;

export const PriceKind = z.enum(["product", "scrap"]);
export type PriceKind = z.infer<typeof PriceKind>;

export const PaymentSurface = z.enum(["card", "credit"]);
export type PaymentSurface = z.infer<typeof PaymentSurface>;

export const ProductQuote = z.object({
  bullion_id: Bullion.shape.id,
  side: PriceSide,
  spots_at: z.string(),
  quantity: z.number(),
  metal_id: Bullion.shape.metal_id,
  content: Bullion.shape.content,
  premium: z.number(),
  unit_price: z.number(),
  line_total: z.number(),
});
export type ProductQuote = z.infer<typeof ProductQuote>;

export const ProductQuoteBody = z.object({
  bullion_id: Bullion.shape.id,
  side: PriceSide,
  quantity: z.number().positive().optional(),
}).strict();
export type ProductQuoteBody = z.infer<typeof ProductQuoteBody>;

export const PurchaseQuoteLine = z.object({
  id: CheckoutItem.shape.id,
  kind: PriceKind,
  metal_id: Metal.shape.id.nullable(),
  content: z.number(),
  quantity: z.number(),
  premium: z.number(),
  unit_price: z.number(),
  line_total: z.number(),
});
export type PurchaseQuoteLine = z.infer<typeof PurchaseQuoteLine>;

export const PurchaseQuote = z.object({
  direction: z.literal("purchase"),
  checkout_id: Checkout.shape.id,
  spots_at: z.string(),
  items: z.array(PurchaseQuoteLine),
  total: z.number(),
  shipping_charge: z.number(),
  payout_charge: z.number(),
  declared_value: z.number(),
  estimated_payout: z.number(),
});
export type PurchaseQuote = z.infer<typeof PurchaseQuote>;

export const SaleQuoteLine = z.object({
  id: CheckoutItem.shape.id,
  kind: PriceKind,
  bullion_id: Bullion.shape.id.nullable(),
  metal_id: Metal.shape.id.nullable(),
  content: z.number(),
  quantity: z.number(),
  premium: z.number(),
  unit_ask: z.number(),
  line_total: z.number(),
  sales_tax_rate: z.number(),
  sales_tax: z.number(),
});
export type SaleQuoteLine = z.infer<typeof SaleQuoteLine>;

export const SaleQuote = z.object({
  direction: z.literal("sale"),
  checkout_id: Checkout.shape.id,
  spots_at: z.string(),
  items: z.array(SaleQuoteLine),
  unpriceable: z.array(CheckoutItem.shape.id),
  item_total: z.number(),
  shipping_charge: z.number(),
  shipping_service: z.string().nullable(),
  sales_tax: z.number(),
  sales_tax_state: z.string().nullable(),
  base_total: z.number(),
  beginning_funds: z.number(),
  ending_funds: z.number(),
  pre_charges_amount: z.number(),
  subject_to_charges_amount: z.number(),
  charges_amount: z.number(),
  post_charges_amount: z.number(),
  order_total: z.number(),
  payment_surface: PaymentSurface,
});
export type SaleQuote = z.infer<typeof SaleQuote>;

export const CheckoutQuote = z.discriminatedUnion("direction", [PurchaseQuote, SaleQuote]);
export type CheckoutQuote = z.infer<typeof CheckoutQuote>;

export const OrderPricingLine = z.object({
  id: OrderItem.shape.id,
  kind: PriceKind,
  source: z.enum(["stored", "quoted"]),
  metal_id: Metal.shape.id,
  content: z.number(),
  quantity: z.number(),
  premium: z.number(),
  retier_premium: z.number().nullable(),
  unit_price: z.number(),
  line_total: z.number(),
});
export type OrderPricingLine = z.infer<typeof OrderPricingLine>;

export const OrderPricing = z.object({
  order_id: Order.shape.id,
  direction: Direction,
  spots_at: z.string(),
  spots_locked: z.boolean(),
  items: z.array(OrderPricingLine),
  unpriceable: z.array(OrderItem.shape.id),
  scrap_total: z.number(),
  bullion_total: z.number(),
  items_total: z.number(),
  shipping_charge: z.number(),
  payout_fee: z.number(),
  total: z.number(),
  declared_value: z.number(),
});
export type OrderPricing = z.infer<typeof OrderPricing>;
