// WHAT PRICING REFUSES (ruling 65). Pure - numbers in, a number or a refusal
// out, no database and no rows loaded here.
//
// EVERY FIGURE PRICING RETURNS IS A NUMBER OR AN EXCEPTION, NEVER NaN.
// Migration 087 had to clean up rows where content reached the wire as the
// string "NaN"; a total that cannot be computed must stop at these, not print
// on a document a customer is paid against.
import { Invalid } from "#shared/errors.ts";
import type { Bids, OrderViewItem } from "@dorado/contracts";

// Split by MEANING, not by nullishness: an ABSENT fee is 0 (no payout row means
// no fee - that is data, not a waiver), and a value that arrived and cannot
// become a number THROWS. `baseTotal - shipping - order.payout.cost` once
// defended one subtrahend and not the other, so a payout object with no `cost`
// key produced NaN all the way to the invoice.
export function feeOf(value: unknown, what: string): number {
  if (value == null) return 0;
  const n = Number(value);
  if (!Number.isFinite(n)) {
    throw new TypeError(`${what} is not a number: ${String(value)}`);
  }
  return n;
}

// The last gate before a total leaves pricing.
export function assertFinite(total: number, what: string): void {
  if (!Number.isFinite(total)) {
    throw new TypeError(`${what} did not come out as a number (${String(total)})`);
  }
}

// A bullion line with no content is corrupt data - migration 120 backfilled
// every row that legitimately lacked one - so it is REFUSED rather than priced
// at zero. A scrap line's content is absent only when nobody has weighed the
// parcel yet, which is a real state and prices at 0.
export function assertRecordedContent(line: OrderViewItem): void {
  if (line.bullion_id !== null) {
    throw new Invalid(`line ${line.id} has no recorded content`);
  }
}

// A METAL WITH NO QUOTE THROWS. `?? 0` would turn a loud failure into an ounce
// of gold valued at nothing, travelling all the way to a payout. A quote that
// EXISTS and is null is different and prices at 0: an order nobody has quoted
// yet correctly has no price.
export function assertQuoted(bids: Bids, line: OrderViewItem): void {
  if (!bids.has(line.metal_id)) {
    throw new TypeError(
      `no quote for metal ${line.metal_id}, so line ${line.id} cannot be priced`
    );
  }
}
