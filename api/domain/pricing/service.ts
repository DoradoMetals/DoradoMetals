// THE pricing service. Ruling 24: one area of the app prices, and nowhere else
// calls pricing except through here.
//
// This module has NO TABLE AND NO HTTP SURFACE, and that is deliberate rather
// than unfinished (CLAUDE.md's rule for a resource with neither). features/
// quotes is the customer-facing HTTP surface - D81-D84, the frontend computes
// no money - and it is a THIN CALLER of this. The PDF renderer and the
// confirmation email need prices without an HTTP hop, which is why the module
// exists apart from the endpoint (ruling 34, last paragraph).
//
// WHERE IT CAME FROM. Eleven functions lived in
// features/purchase-orders/utils/calculations.ts and
// features/sales-orders/utils/calculations.ts and were imported by six
// features. `quotes` imported from BOTH, so it was already the de facto
// pricing service wearing an HTTP hat. What that cost is written in bid.ts's
// header: an invoice and a packing list each carried their own copy of one sum,
// disagreed by $3,236.11 on a single order, and the one without the fallback
// was the declared value on a return shipment.
//
//   bid.ts  what the business PAYS for metal - purchase orders.
//   ask.ts  what the business CHARGES for it - sales orders.
//
// The two do not share code and should not: a bid and an ask are different sums
// with different defaults, most visibly that a metal absent from `spots` throws
// on the bid side and prices at zero on the ask side. Both are pinned.
//
// ----------------------------------------------------------------------------
// THE ARRAY API (ruling 34), which is what a new caller should reach for.
//
// Jacob: "the pricing API should return arrays of prices. Not the items
// themselves." A caller already has the items - it sent them - so echoing them
// back enriched is the composed-wire mistake in another costume (rulings 10 and
// 12). Thirty items is ONE call; one item is an array of one.
//
// TWO ARRAYS BECAUSE THERE ARE TWO PRICES, and conflating them is a real bug
// rather than a tidiness question:
//
//   unitPrices  what ONE of the line costs.  A bullion line of three coins
//               returns the price of a coin. This is what the PDF's line
//               column prints.
//   lineTotals  what the LINE is worth, which is where quantity applies -
//               and it applies to bullion ONLY. A scrap line's `content`
//               already describes the whole lot, so multiplying it by
//               quantity would double-count the customer's metal. That
//               asymmetry is load-bearing and every existing sum honours it.
//
// Both are `number[]`, positionally aligned with the input. Neither returns an
// item.
//
// IT BRANCHES ON `bullion_id IS NULL` (ruling 34c). orders.items is one table
// for both kinds of line, so there are no parallel scrap and product paths to
// maintain - there is one path and one question. `kindOf` below is where that
// question is asked, and it takes either an assembled line (which carries
// `item_type`, itself derived from `bullion_id === null` in compose.ts) or a
// raw orders.items row. The two agree by construction; the normaliser exists
// so a caller holding either can price without composing first.
import type { Spots } from "#domain/pricing/spot.ts";
import { calculateItemPrice, type PriceableLine as BidLine } from "#domain/pricing/bid.ts";

export type { PricingSpot, Spots } from "#domain/pricing/spot.ts";
export * from "#domain/pricing/bid.ts";
export * from "#domain/pricing/ask.ts";

// A line as either of its two spellings. `item_type` is the assembled line's
// field; `bullion_id` is the raw column it is derived from. Structural, like
// the bid side's own parameter type: an assembled ComposedItem satisfies it,
// an orders.items row satisfies it, and so does a two-field test fixture -
// which is what these functions have always actually read.
export type PriceableLine = BidLine & { bullion_id?: string | null };

// scrap, bullion, or neither.
//
// NEITHER IS A REAL ANSWER AND IT IS PINNED: "items of an unknown type
// contribute nothing" sends an item_type no branch recognises and asserts the
// order total ignores it. A line that cannot be identified must be worth
// nothing rather than be guessed at, so an explicit unrecognised `item_type`
// is NOT overridden by looking at bullion_id.
function kindOf(item: PriceableLine): "scrap" | "product" | null {
  const declared = item.item_type;
  if (declared === "scrap" || declared === "product") return declared;
  if (declared !== undefined && declared !== null) return null;
  if (!("bullion_id" in item)) return null;
  return item.bullion_id === null || item.bullion_id === undefined ? "scrap" : "product";
}

// THE PRICE OF ONE OF EACH LINE. Positionally aligned with `items`.
//
// A line pricing to `undefined` - the unrecognised kind - is 0 here rather than
// a hole in the array, because a caller summing an array of prices should not
// have to know that one of the numbers might not be a number.
export function unitPrices(items: PriceableLine[], spots: Spots): number[] {
  return items.map((item) => {
    const kind = kindOf(item);
    if (kind === null) return 0;
    // NORMALISED, NOT RE-IMPLEMENTED. calculateItemPrice asks the kind
    // question its own way (`item_type`), so a raw orders.items row is given
    // the answer `kindOf` already derived rather than being priced by a second
    // copy of the expression here. Two copies of one money sum drifting apart
    // is the $3,236.11 bug in bid.ts's header; there is one copy and this
    // feeds it.
    const line = item.item_type === kind ? item : { ...item, item_type: kind };
    return calculateItemPrice(line, spots) ?? 0;
  });
}

// WHAT EACH LINE IS WORTH. Quantity applies to bullion and not to scrap - see
// the header. Positionally aligned with `items`.
export function lineTotals(items: PriceableLine[], spots: Spots): number[] {
  const unit = unitPrices(items, spots);
  return items.map((item, i) =>
    kindOf(item) === "product" ? unit[i] * (item.quantity ?? 1) : unit[i]
  );
}
