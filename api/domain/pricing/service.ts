// THE pricing service (ruling 24) — nowhere else in the app computes a price. No table, no HTTP surface, on purpose: quotes is the customer-facing caller (D81-D84, frontend computes no money), and the PDF/email renderers need prices without an HTTP hop.
// bid.ts (what the business PAYS, purchase orders) and ask.ts (what it CHARGES, sales orders) don't share code — different defaults: a metal missing from spots throws on bid, prices at zero on ask.
// Consolidated from duplicated calculation files that had drifted — an invoice and a packing list once disagreed by $3,236.11 on one order because each carried its own copy of the same sum.
// THE ARRAY API (ruling 34): returns arrays of prices, never the items back — a caller already has the items it sent. unitPrices is what ONE line costs; lineTotals is what the LINE is worth, and quantity applies to bullion only (a scrap line's `content` already describes the whole lot; multiplying would double-count).
// Branches on `bullion_id IS NULL` (ruling 34c) — orders.items is one table for both kinds of line, so there's one path and one question, asked once in kindOf below.
import type { Spots } from "#domain/pricing/spot.ts";
import { calculateItemPrice, type PriceableLine as BidLine } from "#domain/pricing/bid.ts";

export type { PricingSpot, Spots } from "#domain/pricing/spot.ts";
export * from "#domain/pricing/bid.ts";
export * from "#domain/pricing/ask.ts";

// Structural — an assembled ComposedItem, a raw orders.items row, or a two-field test fixture all satisfy this, same as the bid side's own parameter type.
export type PriceableLine = BidLine & { bullion_id?: string | null };

// scrap, bullion, or neither — an item with an item_type no branch recognizes prices as 0, not overridden by inspecting bullion_id: unidentifiable must mean worth nothing, never guessed at.
function kindOf(item: PriceableLine): "scrap" | "product" | null {
  const declared = item.item_type;
  if (declared === "scrap" || declared === "product") return declared;
  if (declared !== undefined && declared !== null) return null;
  if (!("bullion_id" in item)) return null;
  return item.bullion_id === null || item.bullion_id === undefined ? "scrap" : "product";
}

// Price of ONE of each line, positionally aligned with items. An unrecognized kind prices as 0, not a hole in the array — a caller summing shouldn't need to know one entry might not be a number.
export function unitPrices(items: PriceableLine[], spots: Spots): number[] {
  return items.map((item) => {
    const kind = kindOf(item);
    if (kind === null) return 0;
    // Normalised, not re-implemented — calculateItemPrice asks its own kind question; a raw row is handed kindOf's already-derived answer rather than priced by a second copy of the same logic (the drift that caused the header's $3,236.11 bug).
    const line = item.item_type === kind ? item : { ...item, item_type: kind };
    return calculateItemPrice(line, spots) ?? 0;
  });
}

// Quantity applies to bullion, not scrap — see the header.
export function lineTotals(items: PriceableLine[], spots: Spots): number[] {
  const unit = unitPrices(items, spots);
  return items.map((item, i) =>
    kindOf(item) === "product" ? unit[i] * (item.quantity ?? 1) : unit[i]
  );
}
