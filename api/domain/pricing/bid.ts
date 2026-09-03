// WHAT THE BUSINESS PAYS FOR METAL (bid side) - the mirror of ask.ts, which is
// what it charges. The two share no code: a metal missing from the quote feed
// THROWS here and prices at zero there, and that asymmetry is deliberate and
// pinned by tests.
//
// ONE EXPRESSION, NOT FOUR. This file used to carry the same reduce four times
// - calculateTotalPrice, calculateReturnDeclaredValue, getBullionTotal and
// getScrapTotal - each with a `product` branch and a `scrap` branch, each
// finding its spot by a METAL NAME that lived on a different nested object in
// each branch (`item.product.metal_type` for bullion, `item.scrap.metal` for
// scrap). That is where the $3,236.11 divergence between an invoice and a
// packing list came from: two copies of one sum, drifting.
//
// The composed order died with D214 item 12, and the split went with it. A line
// is an `orders.items` row: `metal_id` is on it for BOTH kinds, `bullion_id`
// says which kind it is (ruling 34c), and the CONTENT is the only thing that
// differs - a scrap line carries its own, a bullion line takes its product's
// and multiplies by how many. So there is one price expression, asked once.
//
// TWO BEHAVIOURS THAT LOOK WRONG AND ARE LOAD-BEARING:
//
//   A METAL WITH NO QUOTE THROWS. `bids.get(metal_id)` answering undefined
//   used to be `spot!.bid`, a deliberate TypeError. `?? 0` would turn a loud
//   failure into an ounce of gold valued at nothing, travelling all the way to
//   a payout. A quote that EXISTS and is null is different and prices at 0:
//   an order nobody has quoted yet correctly has no price, and five production
//   scrap lines are in exactly that state, every one on an In Transit or
//   Cancelled order.
//
//   A STORED PRICE WINS. `item.price` is what the business committed to when
//   the order was finalised; recomputing it from today's spot would reprice a
//   settled order. Only a line with no stored price is computed.
//
// EVERY FIGURE THIS MODULE RETURNS IS A NUMBER OR AN EXCEPTION, NEVER NaN.
// Migration 087 had to clean up rows where content reached the wire as the
// string "NaN"; a total that cannot be computed must stop here, not print on a
// document a customer is paid against.
import { Invalid } from "#shared/errors.ts";
import type { orders } from "@dorado/contracts";


// THE QUOTE FEED, KEYED BY THE METAL IT PRICES. A map rather than an array of
// `{name, ask, bid}` because a line names a metal by ID and always has: the
// name lookup was a join the composed order carried, and matching on a display
// string is how "Gold" and "gold" become two metals.
//
// The caller builds it from whichever quote is right for the question - the
// order's FROZEN spots for a placed order, the live feed for an estimate.
export type Bids = ReadonlyMap<string, number | null>;

// THE PARCEL THE CUSTOMER SENT, not the one going back. A return leg's cost is
// the business's to bear and must never be deducted from what a customer is
// paid.
export function inboundShipment(view: orders.orders.View): orders.orders.View["shipments"][number] | null {
  return view.shipments.find((s) => s.direction !== "Return") ?? null;
}

// Split by MEANING, not by nullishness: an ABSENT fee is 0 (no payout row means
// no fee - that is data, not a waiver), and a value that arrived and cannot
// become a number THROWS. `baseTotal - shipping - order.payout.cost` once
// defended one subtrahend and not the other, so a payout object with no `cost`
// key produced NaN all the way to the invoice.
function fee(value: unknown, what: string): number {
  if (value == null) return 0;
  const n = Number(value);
  if (!Number.isFinite(n)) {
    throw new TypeError(`${what} is not a number: ${String(value)}`);
  }
  return n;
}

function finite(total: number, what: string): number {
  if (!Number.isFinite(total)) {
    throw new TypeError(`${what} did not come out as a number (${String(total)})`);
  }
  return total;
}

// THE WAIVER IS A FLAG AND THE FEE IS A RECORD (D117): waiving does not
// overwrite `cost`, so un-waiving does not have to guess what it was.
//
// The parameter names what the rule reads and nothing else, because three
// surfaces price a payout - the stored total, the drawer estimate and the
// customer's profit breakdown - and they hold an order in two shapes: an
// orders.orders.View carries the flag on `totals`, the quote surface's own assembled
// order carries it at the top level. One condition, both spellings, rather
// than three copies that can disagree.
export function effectivePayoutFee(order: {
  payout?: { cost?: number | null } | null;
  waive_payout_fee?: boolean | null;
  totals?: { waive_payout_fee?: boolean | null } | null;
}): number {
  if (order.waive_payout_fee === true) return 0;
  if (order.totals?.waive_payout_fee === true) return 0;
  return fee(order.payout?.cost, "the payout fee");
}

// The line's own content, and only the line's. Migration 120 backfilled the
// rows that used to need a catalogue fallback; a bullion line with none left
// is corrupt data, not a case this function papers over.
export function recordedContent(line: orders.items.ViewItem): number | null {
  return line.content ?? null;
}

export function unitContent(line: orders.items.ViewItem): number {
  const content = recordedContent(line);
  if (content == null) {
    // A bullion line with no content is corrupt data (migration 120 backfilled
    // every row that legitimately lacked one) - REFUSE rather than price at
    // zero. A scrap line's content is absent only when nobody has weighed the
    // parcel yet, which is a real state and prices at 0.
    if (line.bullion_id !== null) {
      throw new Invalid(`line ${line.id} has no recorded content`);
    }
    return 0;
  }
  // UNREADABLE IS NaN, deliberately. Migration 087 had to clean up rows whose
  // content reached the wire as the STRING "NaN"; `|| 0` here would turn that
  // into a free line on an invoice instead of stopping the total, which is
  // what `finite` below exists to do.
  return Number(content);
}

// How many of the line there are. A scrap lot is one lot however many pieces
// were in the bag - multiplying its content by a quantity double-counts.
export function unitsOf(line: orders.items.ViewItem): number {
  if (line.bullion_id === null) return 1;
  const quantity = Number(line.quantity ?? 1);
  return Number.isFinite(quantity) ? quantity : 1;
}

// WHAT ONE OF THIS LINE IS WORTH. The stored price wins; otherwise it is fine
// metal times the quote times the premium the line carries.
export function unitPrice(line: orders.items.ViewItem, bids: Bids): number {
  if (line.price != null) return line.price;
  if (!bids.has(line.metal_id)) {
    throw new TypeError(
      `no quote for metal ${line.metal_id}, so line ${line.id} cannot be priced`
    );
  }
  return unitContent(line) * ((bids.get(line.metal_id) ?? 0) * (line.premium ?? 0));
}

// WHAT THE LINE IS WORTH: one unit times how many.
export function linePrice(line: orders.items.ViewItem, bids: Bids): number {
  return unitPrice(line, bids) * unitsOf(line);
}

export function itemsTotal(lines: orders.items.ViewItem[], bids: Bids): number {
  return lines.reduce((sum, line) => sum + linePrice(line, bids), 0);
}

// The scrap lines and the bullion lines, when a document prints them apart.
export function scrapLines(lines: orders.items.ViewItem[]): orders.items.ViewItem[] {
  return lines.filter((line) => line.bullion_id === null);
}

export function bullionLines(lines: orders.items.ViewItem[]): orders.items.ViewItem[] {
  return lines.filter((line) => line.bullion_id !== null);
}

// WHAT THE CUSTOMER IS PAID: the metal, less the postage they were charged and
// the fee for moving the money. Both subtrahends go through `fee`, which is the
// point - the asymmetry between them is how the NaN got in.
export function calculateTotalPrice(view: orders.orders.View, bids: Bids): number {
  const metal = itemsTotal(view.items, bids);
  const shipping = fee(inboundShipment(view)?.cost, "the shipping charge");
  return finite(metal - shipping - effectivePayoutFee(view), "the order total");
}

// WHAT THE RETURN PARCEL IS INSURED FOR: the metal, and neither fee. A return
// is insured for what the metal is worth, and a NaN here posts a customer's
// metal back uninsured.
export function calculateReturnDeclaredValue(view: orders.orders.View, bids: Bids): number {
  return finite(itemsTotal(view.items, bids), "the return declared value");
}
