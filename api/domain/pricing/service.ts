// THE pricing service (ruling 24) - nowhere else in the app computes a price.
// No table, no HTTP surface, on purpose: quotes is the customer-facing caller
// (D81-D84, the frontend computes no money), and the PDF/email renderers need
// prices without an HTTP hop.
//
// bid.ts is what the business PAYS (purchase orders) and ask.ts what it
// CHARGES (sales orders). They share no code, and the difference that matters
// is what happens when a metal has no quote: bid THROWS, ask prices at zero.
//
// THE ARRAY API RETIRED WITH THE COMPOSED ORDER (D214 item 12). `unitPrices`
// and `lineTotals` existed to price a list of composed lines whose kind was
// declared by an `item_type` string, normalising it when the string and the
// `bullion_id` disagreed. There is no composed line and no `item_type` any
// more - a line is an `orders.items` row and its kind is `bullion_id === null`
// - so the two functions had one implementation left, no production caller,
// and a normalisation step for a field that no longer exists. bid.ts's
// `linePrice` / `itemsTotal` are what a caller wants now.
export type { PricingSpot, Spots } from "#domain/pricing/spot.ts";
export * from "#domain/pricing/bid.ts";
export * from "#domain/pricing/ask.ts";
