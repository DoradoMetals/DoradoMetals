import { z } from "zod/v4";

// The quote surface: what the API answers when a customer asks what something
// costs, before anything exists to store.
//
// STATED DIRECTLY, NOT DERIVED FROM A TABLE, and that is the exception that
// proves this package's rule. Every other wire schema leans on a generated row
// type because the endpoint serves rows; these three shapes are COMPUTED -
// content * spot * premium arithmetic that is returned and never written - so
// there is no table to derive from and nothing for drift detection to compare
// against. They are the PERMANENT API CONTRACT for the quote surface: Jacob's
// ruling (FOLLOWUPS.md, 2026-08-28 evening) kills all client-side money math,
// so the frontend reads every customer-visible number out of these shapes and
// a field changing here is a wire change, not a refactor.
//
// All money is DOLLARS, like everywhere else on the wire. `spots_at` is the
// server clock at the moment the spots were read: a quote prices at what the
// business holds right now (see getPricingSpots' header), and the timestamp
// says when "now" was.

// One catalogue line, priced in the direction the caller asked for.
export const CatalogQuoteLineWire = z.object({
  id: z.string().uuid(),
  quantity: z.number(),
  unit_price: z.number(),
  line_total: z.number(),
});
export type CatalogQuoteLineWire = z.infer<typeof CatalogQuoteLineWire>;

// POST /quotes/catalog. Public, like /spots/spot_prices: the catalogue quotes
// to anyone who visits. `side` echoes the request so a response cached or
// logged out of context still says which price it is.
export const CatalogQuoteWire = z.object({
  side: z.enum(["ask", "bid"]),
  spots_at: z.string(),
  items: z.array(CatalogQuoteLineWire),
  total: z.number(),
});
export type CatalogQuoteWire = z.infer<typeof CatalogQuoteWire>;

// One sales-order line: the ask at the moment of the quote, and the tax rate
// the line's state and product facts resolved to.
export const SalesOrderQuoteLineWire = z.object({
  id: z.string().uuid(),
  quantity: z.number(),
  unit_ask: z.number(),
  line_total: z.number(),
  sales_tax_rate: z.number(),
});
export type SalesOrderQuoteLineWire = z.infer<typeof SalesOrderQuoteLineWire>;

// POST /quotes/sales_order. The full OrderPrices breakdown createSalesOrder
// records, computed without the insert - the field names are calculations.ts's
// own, because a quote that renames what the order will store is a quote for a
// different order.
export const SalesOrderQuoteWire = z.object({
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
  items: z.array(SalesOrderQuoteLineWire),
});
export type SalesOrderQuoteWire = z.infer<typeof SalesOrderQuoteWire>;

// One purchase-order line. `index` is the request array position - sell-cart
// lines have no stable id - and `premium` is the resolved rates-band fraction,
// never null: a line whose premium cannot be resolved is refused, not priced
// at nothing.
export const PurchaseOrderQuoteLineWire = z.object({
  index: z.number().int(),
  kind: z.enum(["product", "scrap"]),
  metal: z.string(),
  content: z.number(),
  premium: z.number(),
  unit_price: z.number(),
  line_total: z.number(),
});
export type PurchaseOrderQuoteLineWire = z.infer<typeof PurchaseOrderQuoteLineWire>;

// POST /quotes/purchase_order. What the business would pay for a sell cart.
// declared_value is the total, uncapped - the $50,000 FedEx ceiling the
// frontend's getDeclaredValue applies is a shipping constraint, applied where
// the label is bought (see the note in features/quotes/service.ts).
export const PurchaseOrderQuoteWire = z.object({
  spots_at: z.string(),
  items: z.array(PurchaseOrderQuoteLineWire),
  total: z.number(),
  declared_value: z.number(),
});
export type PurchaseOrderQuoteWire = z.infer<typeof PurchaseOrderQuoteWire>;
