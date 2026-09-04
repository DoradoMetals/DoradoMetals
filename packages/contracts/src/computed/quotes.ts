import { z } from "zod/v4";

// computed: no table backs these. See src/computed/README note in the package
// README - this directory is the ONE place lint:contracts-derived does not
// require a row to derive from, and it is pinned from both sides.
//
// The quote surface: what the API answers when a customer asks what something
// costs, before anything exists to store.
//
// STATED DIRECTLY, NOT DERIVED FROM A TABLE. Every entity contract leans on a
// generated Row because the endpoint serves rows; these shapes are COMPUTED -
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

// ===========================================================================
// PRICING PRIMITIVES (ruling 57/60/61)
// ===========================================================================
//
// Not answers of their own - domain/pricing and domain/quotes build every
// shape above out of these - but each one is exported across features
// (domain/orders' rules.ts, domain/media/pdfs, domain/sales-tax all read one)
// so the type-homes rule gives it one home here rather than a copy per file.
// Never themselves a response body: a Map has no JSON form, and a spot/bid
// pair is read off `spots.spots`' own SpotPrice/SpotTicker for GET /spots.

// A spot as pricing reads it - just what a line prices against. Optional AND
// nullable throughout: several call sites pass whatever a read returned
// without checking, so "the feed has nothing for this metal" and "the feed
// answered null" have to be the same question here.
export const PricingSpot = z.object({
  name: z.string().nullable().optional(),
  ask: z.number().nullable().optional(),
  bid: z.number().nullable().optional(),
});
export type PricingSpot = z.infer<typeof PricingSpot>;

// Spots as a caller holds them - nullable/undefined for the same reason.
export const Spots = z.array(PricingSpot).nullable().optional();
export type Spots = z.infer<typeof Spots>;

// THE BID FEED, KEYED BY METAL ID. domain/pricing/bid.ts and
// domain/quotes/profit.ts each build one to look a line's price up by the
// metal id it names rather than a display string a join could disagree on.
export const Bids = z.map(z.string(), z.number().nullable());
export type Bids = z.infer<typeof Bids>;

// One catalogue line, priced in the direction the caller asked for.
export const CatalogQuoteLine = z.object({
  id: z.string().uuid(),
  quantity: z.number(),
  unit_price: z.number(),
  line_total: z.number(),
});
export type CatalogQuoteLine = z.infer<typeof CatalogQuoteLine>;

// POST /quotes/catalog. Public, like GET /spots: the catalogue quotes
// to anyone who visits. `side` echoes the request so a response cached or
// logged out of context still says which price it is.
export const CatalogQuote = z.object({
  side: z.enum(["ask", "bid"]),
  spots_at: z.string(),
  items: z.array(CatalogQuoteLine),
  total: z.number(),
});
export type CatalogQuote = z.infer<typeof CatalogQuote>;

// One sales-order line: the ask at the moment of the quote, and the tax rate
// the line's state and product facts resolved to.
export const SalesOrderQuoteLine = z.object({
  id: z.string().uuid(),
  quantity: z.number(),
  unit_ask: z.number(),
  line_total: z.number(),
  sales_tax_rate: z.number(),
});
export type SalesOrderQuoteLine = z.infer<typeof SalesOrderQuoteLine>;

// WHICH PAYMENT SURFACE THE CUSTOMER IS SHOWN. A server field, not a browser
// derivation: the checkout used to compute `beginning_funds < base_total`
// itself and decide whether to mount Stripe's element on the answer, which is
// the last piece of money reasoning left in the browser (D81-D84) and the one
// most expensive to get wrong - a customer shown a card form for an order the
// card is not charged for, or none for an order it is.
//
// "credit" means the balance covers the whole thing and there is nothing for a
// card to do. "card" means something is left to charge. It is derived from
// `post_charges_amount`, which is the amount Stripe is actually told, so it
// cannot disagree with what gets charged - and it accounts for the sliver
// held back below Stripe's minimum, which `beginning_funds < base_total`
// could not see.
export const PaymentSurface = z.enum(["card", "credit"]);
export type PaymentSurface = z.infer<typeof PaymentSurface>;

// POST /quotes/sales_order. The full OrderPrices breakdown createSalesOrder
// records, computed without the insert - the field names are calculations.ts's
// own, because a quote that renames what the order will store is a quote for a
// different order.
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

// domain/pricing/ask.ts's calculateSalesOrderTotal return shape -
// SalesOrderQuote UNDECORATED: no spots_at (read once for the whole quote,
// one level up), no payment_surface or items (both computed one level up
// too, in quotes/service.ts). domain/orders/rules.ts imports this name as
// well - it is what createSalesOrder stores on the order, and a quote that
// renamed it would be quoting a different order than the one that gets
// placed (see SalesOrderQuote's own note).
export const OrderPrices = SalesOrderQuote.omit({
  spots_at: true, payment_surface: true, items: true,
});
export type OrderPrices = z.infer<typeof OrderPrices>;

// One purchase-order line. `index` is the request array position - sell-cart
// lines have no stable id - and `premium` is the resolved rates-band fraction,
// never null: a line whose premium cannot be resolved is refused, not priced
// at nothing.
export const PurchaseOrderQuoteLine = z.object({
  index: z.number().int(),
  kind: z.enum(["product", "scrap"]),
  metal: z.string(),
  content: z.number(),
  premium: z.number(),
  unit_price: z.number(),
  line_total: z.number(),
});
export type PurchaseOrderQuoteLine = z.infer<typeof PurchaseOrderQuoteLine>;

// POST /quotes/purchase_order. What the business would pay for a sell cart.
// declared_value is the total, uncapped - the $50,000 FedEx ceiling the
// frontend's getDeclaredValue applies is a shipping constraint, applied where
// the label is bought (see the note in features/quotes/service.ts).
// `total` is what the GOODS are worth; `estimated_payout` is what the customer
// receives, which is that minus the two deductions returned beside it. The
// three travel together deliberately (D97): the checkout printed a headline
// figure and two rows underneath it that contradicted each other, because the
// headline was computed in the browser and the rows were not.
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

// One line of an EXISTING purchase order, priced. `id` is the order item's
// own id - unlike the sell-cart quote these lines are stored rows, so the
// pairing key is the row and not the request position. `source` says which
// side of the accept boundary the number came from: "stored" is the price
// the accept flow froze onto the item, returned verbatim; "estimate" is
// content * bid_spot * premium computed on request. `premium` is the
// resolved fraction that multiplied into an estimate (for a stored line it
// is the same chain, reported for display); never null - the fallback
// chains bottom out at the frontend defaults this surface replaced.
export const OrderQuoteLine = z.object({
  id: z.string().uuid(),
  kind: z.enum(["product", "scrap"]),
  source: z.enum(["stored", "estimate"]),
  premium: z.number(),
  unit_price: z.number(),
  line_total: z.number(),
});
export type OrderQuoteLine = z.infer<typeof OrderQuoteLine>;

// POST /quotes/order. What an existing purchase order is worth right now -
// the order-drawer estimate the purchaseOrderTotal family used to compute
// client-side. Guarded: a caller may only quote an order they own, admins
// any. `total` mirrors the drawers' bottom line: scrap_total + bullion_total
// minus the order's shipping charge and payout cost, both stored fields.
export const OrderQuote = z.object({
  order_id: z.string().uuid(),
  spots_at: z.string(),
  items: z.array(OrderQuoteLine),
  scrap_total: z.number(),
  bullion_total: z.number(),
  total: z.number(),
});
export type OrderQuote = z.infer<typeof OrderQuote>;

// One metal's slice of the profit split: how much of it a party owns, what
// share of the order's total that is, and what it is worth at the bid the
// split values that party at.
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

// One party's view of the order - the metal split by category plus the fees
// that land on them. The field names are the frontend's own
// computePurchaseOrderTotals shapes, ported server-side (D83): this endpoint
// replaces the last client-side money math, so the shape is the one the
// profit drawer already renders.
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

// POST /quotes/profit_breakdown. ADMIN ONLY, and that is a property of the
// shape, not just the route: this is what the business makes on an order -
// margins, the refiner's share, the spot spread - and none of it may ever be
// customer-reachable. spots_at says when the live half of the numbers was
// read, matching the other quote shapes.
export const ProfitBreakdown = z.object({
  order_id: z.string().uuid(),
  spots_at: z.string(),
  refiner: ProfitCategoriesDict,
  dorado: ProfitCategoriesDict,
  customer: ProfitCategoriesDict,
});
export type ProfitBreakdown = z.infer<typeof ProfitBreakdown>;

// ===========================================================================
// THE REQUEST BODIES
// ===========================================================================
//
// Everything above describes what the quote surface ANSWERS; these describe
// what it ACCEPTS, so the transport boundary parses once, strictly, before any
// money is computed.
//
// IDS AND QUANTITIES, NEVER PRICES (D214 item 11, ruling 43). A quote's whole
// job is to be the ONE place a customer-visible number comes from, so a body
// that could name a premium, a spot or a metal's price would be the surface
// pricing itself against the caller. The one number any of these accepts is
// `shipping_charge`, and its own note says why.

// One catalogue line: which product, and how many.
export const QuoteItem = z.object({
  id: z.string().uuid(),
  quantity: z.number().optional(),
}).strict();
export type QuoteItem = z.infer<typeof QuoteItem>;

// POST /quotes/catalog. Public, like GET /spots.
export const CatalogQuoteBody = z.object({
  side: z.enum(["ask", "bid"]),
  items: z.array(QuoteItem).min(1),
}).strict();
export type CatalogQuoteBody = z.infer<typeof CatalogQuoteBody>;

// POST /quotes/sales_order. `user_id` is ADMIN ONLY and names whose credit
// balance the order prices against; a customer's own subject is their session.
// `using_funds` is GONE: credit applies whenever the customer has a balance,
// which is what placement does, so a quote that could switch it off would
// quote a different order than the one that gets placed.
export const SalesOrderQuoteBody = z.object({
  items: z.array(QuoteItem).min(1),
  address_id: z.string().uuid().nullable().optional(),
  carrier_service_id: z.string().uuid().nullable().optional(),
  payment_method_id: z.string().uuid().nullable().optional(),
  user_id: z.string().uuid().optional(),
}).strict();
export type SalesOrderQuoteBody = z.infer<typeof SalesOrderQuoteBody>;

// One sell-cart line, as the two things a customer can offer. A product line
// is a catalogue id; a scrap line is a DECLARATION - which metal, how much it
// weighs, how pure, in what unit - and the server turns that into content.
// NO METAL NAMES and no content: `metal_id` is the id the sell cart already
// holds, and a stated content would be the customer declaring the quantity of
// fine metal they are paid for.
export const PurchaseQuoteProduct = z.object({
  type: z.literal("product"),
  bullion_id: z.string().uuid(),
  quantity: z.number().optional(),
}).strict();
export type PurchaseQuoteProduct = z.infer<typeof PurchaseQuoteProduct>;

export const PurchaseQuoteScrap = z.object({
  type: z.literal("scrap"),
  metal_id: z.string().uuid(),
  pre_melt: z.number(),
  purity: z.number(),
  unit: z.string().optional(),
}).strict();
export type PurchaseQuoteScrap = z.infer<typeof PurchaseQuoteScrap>;

export const PurchaseQuoteItem = z.discriminatedUnion("type", [
  PurchaseQuoteProduct, PurchaseQuoteScrap,
]);
export type PurchaseQuoteItem = z.infer<typeof PurchaseQuoteItem>;

// POST /quotes/purchase_order. `payout_method_id` is the method row whose fee
// is deducted; `shipping_charge` is the ONE number taken from the body - the
// carrier's already-quoted net charge, which the server cannot reproduce
// without re-quoting FedEx (non-deterministic, slow, and a second charge for a
// rate the caller already holds). DISPLAY ONLY: the payout an order actually
// pays is computed at accept time from the shipment row's own net_charge, so
// understating it here only inflates the caller's own screen.
export const PurchaseOrderQuoteBody = z.object({
  items: z.array(PurchaseQuoteItem).min(1),
  payout_method_id: z.string().uuid().nullable().optional(),
  shipping_charge: z.number().nonnegative().nullable().optional(),
}).strict();
export type PurchaseOrderQuoteBody = z.infer<typeof PurchaseOrderQuoteBody>;

// POST /quotes/order and POST /quotes/profit_breakdown. One id each: an
// existing order is entirely the server's, so nothing else can be asked.
export const OrderQuoteBody = z.object({
  order_id: z.string().uuid(),
}).strict();
export type OrderQuoteBody = z.infer<typeof OrderQuoteBody>;
