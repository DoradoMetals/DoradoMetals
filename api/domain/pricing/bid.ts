// What the business PAYS for metal (bid side) — mirrors ask.ts (what it charges).
// THE BUG THIS FILE'S STORY IS: scrap read `item.premium` alone while product fell back to the row's own bid_premium — an oversight that valued a null-premium scrap line at zero. Found by comparing two PDFs for the same order: the invoice (no fallback) said $4,744.11, the packing list (had one) said $7,980.22 — $3,236.11 of gold the invoice didn't count. Worse on calculateReturnDeclaredValue: that gap would have shipped metal back uninsured.
// No production order changes: of 81 scrap lines, zero have a null premium — this could only ever have understated, never overstated.
// TWO CHOICES BELOW LOOK WRONG AND ARE DELIBERATE. `spot` is `PricingSpot | undefined` (Array.find), and every use dereferences it with `!` rather than `?.` — pinned by a test asserting the TypeError. `spot?.bid` would turn a loud failure into `undefined * content` = NaN traveling all the way to a payout; a metal with no spot must stop pricing, not silently price at zero.
// `bid` IS NULLABLE and `?? 0` on it is behavior-preserving, not a fix (JS already reads `null * x` as 0) — it just makes the intent explicit. Confirmed safe: the 5 production scrap lines currently priced against a null bid all belong to un-quoted (In Transit/Cancelled) orders, never a priced one.
//
// That sounds like the premium bug in the header and is not. Checked against
// production: 5 scrap lines are currently priced against a metal whose frozen
// bid is null, and every one of them belongs to an order that is In
// Transit or Cancelled - a spot is frozen when the offer is made, so an order
// nobody has quoted yet correctly has no price. The dangerous version would be
// a null spot on a priced order, and there are none.
//
// WHAT A PURCHASE PAYS FOR BULLION IS THE LINE'S PREMIUM, FULL STOP (Jacob, 2026-09-03). Every product branch here used to fall back to `product.bid_premium` when the line carried none; that made the catalogue's own figure a price the business could pay without the rates table ever agreeing to it. A purchase bullion line now gets the rate band's bullion_pct written onto it at creation and at every re-tier (domain/orders/rules.ts retierPlan), so the fallback described a state that no longer occurs and, where it did, produced the wrong number rather than a missing one.
// The SCRAP branch keeps its `?? item.scrap.bid_premium` and that is not an inconsistency: 085 collapsed scrap into orders.items, and compose.ts serves `scrap.bid_premium` FROM `item.premium`, so on a composed line the two are the same value. It is a wire alias, not a second source, and removing it would break the hand-assembled PDF/email fixtures for no gain.
// The composed line (scrap/product nested) is an INTERNAL shape now, not a wire contract — the wire serves orders.items rows verbatim; this assembled shape survives only where pricing and the confirmation email need an order put back together.
// Declares only the six fields these sums read, not the ten-field ComposedItem — a hand-built fixture or an /orders/:id/items body doesn't carry a full composed line, and the wider type let 11 real mismatches through until the tests converted to TypeScript caught them.
// The ask side already declared its own subset (PriceableItem) for the same reason; a ComposedItem still satisfies this, and every existing test passed unedited.
export type PriceableLine = {
  item_type?: string | null;
  price?: number | null;
  premium?: number | null;
  quantity?: number | null;
  // NO bid_premium. A purchase bullion line's premium is the rate band's
  // bullion_pct, written onto the line by the re-tier - the catalogue figure is
  // not a price fact and must not be reachable from a sum (Jacob, 2026-09-03).
  product?: {
    metal_type?: string | null;
    content?: number | null;
  } | null;
  scrap?: {
    metal?: string | null;
    content?: number | null;
    bid_premium?: number | null;
  } | null;
};

// The name the sums below were written against, kept so the expressions read
// unchanged from the file they moved out of.
type PurchaseOrderItem = PriceableLine;
import type { PricingSpot, Spots } from "#domain/pricing/spot.ts";

// Declared once in spot.ts; re-exported here so existing importers keep working.
export type { PricingSpot, Spots } from "#domain/pricing/spot.ts";

// What these functions need of an order, not the whole wire shape — the PDF/email code passes assembled objects missing columns, and requiring the full shape would force casts there.
type PricedOrder = {
  order_items: PurchaseOrderItem[];
  shipment?: { shipping_charge?: number | null } | null;
  // Was `{ cost: number }` until 2026-08-29 — a lie the type system repeated from OrderLike's own `req.body`-shaped header; nothing actually checked it.
  // Widened to what the data can be: compose.ts's EMPTY_PAYOUT makes `cost` genuinely null for an order with no payout row (32 of dev's 48) and lets a fixture omit the key entirely — `order.payout.cost` no longer compiles unchecked.
  payout?: { cost?: number | null } | null;
  // Optional because most callers here (PDF/email renderers) hand-assemble the order; omitting it means not-waived, the default every production row is in today.
  waive_payout_fee?: boolean | null;
};

// EVERY FIGURE THIS MODULE RETURNS IS A NUMBER OR AN EXCEPTION. NEVER NaN. Replaces a real defect: `baseTotal - shipping - order.payout.cost` defended one subtrahend (`shipping ?? 0`) but not the other, so payout `{}` (no `cost` key, unlike `{cost: null}`) silently produced NaN all the way to the invoice.
// Split by MEANING, not nullishness: ABSENT payout -> 0 (no payout row means no fee — that's data, not a waiver, so a payout with a real cost still subtracts it); a value that arrived but can't become a number -> throw (a loud TypeError beats a silently wrong total on a money path).
// This deliberately changes `payout: null` from throw to 0 — a null payout has a well-defined meaning (no payout method assigned yet) and throwing would refuse to invoice roughly two-thirds of dev's purchase orders. `spot!` stays a throw: an unpriced item makes the WHOLE total meaningless, not just missing one subtrahend.
function fee(value: unknown, what: string): number {
  if (value == null) return 0;
  const n = Number(value);
  if (!Number.isFinite(n)) {
    throw new TypeError(`${what} is not a number: ${String(value)}`);
  }
  return n;
}

// The waiver flag exists because `payout.cost` alone couldn't express Jacob waiving a fee on a real order (two production WIRE payouts show cost=0 against a $20 method fee, previously done by overwriting the record) — waive_payout_fee already existed as a column with no writer or UI.
// Exported because three surfaces price a payout (calculateTotalPrice, the drawer estimate, the customer's profit breakdown) — one shared condition instead of three copies that could disagree.
export function effectivePayoutFee(order: {
  payout?: { cost?: number | null } | null;
  waive_payout_fee?: boolean | null;
}): number {
  if (order.waive_payout_fee === true) return 0;
  return fee(order.payout?.cost, "the payout fee");
}

// Earns its place independently — migration 087 had to clean up rows where content literally reached the wire as the string "NaN"; a total that can't be computed must stop here, not print on a document a customer is paid against.
function finite(total: number, what: string): number {
  if (!Number.isFinite(total)) {
    throw new TypeError(`${what} did not come out as a number (${String(total)})`);
  }
  return total;
}


export function calculateTotalPrice(order: PricedOrder, spots: Spots): number {
  const baseTotal = order.order_items.reduce((acc: number, item: PurchaseOrderItem) => {
    if (item.item_type === "product") {
      const spot = spots?.find((s: PricingSpot) => s.name === item.product?.metal_type);

      const price =
        item.price ??
        (item?.product?.content ?? 0) *
          ((spot!.bid ?? 0) *
            (item.premium ?? 0));

      const quantity = item.quantity ?? 1;
      return acc + price * quantity;
    }

    if (item.item_type === "scrap") {
      const spot = spots?.find((s: PricingSpot) => s.name === item.scrap?.metal);

      const price =
        item.price ??
        (item?.scrap?.content ?? 0) * ((spot!.bid ?? 0) * (item.premium ?? item?.scrap?.bid_premium ?? 0));
      return acc + price;
    }

    return acc;
  }, 0);

  // Both subtrahends through the same function, which is the point: the
  // asymmetry between these two lines is how the NaN got in.
  const shipping = fee(order.shipment?.shipping_charge, "the shipping charge");
  const payout = effectivePayoutFee(order);

  return finite(baseTotal - shipping - payout, "the order total");
}

export function calculateReturnDeclaredValue(order: PricedOrder, spots: Spots): number {
  const total = order.order_items.reduce((acc: number, item: PurchaseOrderItem) => {
    if (item.item_type === "product") {
      const spot = spots?.find((s: PricingSpot) => s.name === item.product?.metal_type);

      const price =
        (item?.product?.content ?? 0) *
        ((spot!.bid ?? 0) *
          (item.premium ?? 0));

      const quantity = item.quantity ?? 1;
      return acc + price * quantity;
    }

    if (item.item_type === "scrap") {
      const spot = spots?.find((s: PricingSpot) => s.name === item.scrap?.metal);

      const price =
        (item?.scrap?.content ?? 0) * ((spot!.bid ?? 0) * (item.premium ?? item?.scrap?.bid_premium ?? 0));
      return acc + price;
    }

    return acc;
  }, 0);

  // Deducts neither fee — a return is insured for what the metal is worth; a NaN here posts a customer's metal back uninsured, the failure this file's header opens with.
  return finite(total, "the return declared value");
}

export function calculateItemPrice(
  item: PurchaseOrderItem,
  spots: Spots
): number | undefined {
  if (item.item_type === "product") {
    const spot = spots?.find((s: PricingSpot) => s.name === item.product?.metal_type);
    return (
      item.price ??
      (item?.product?.content ?? 0) *
        ((spot!.bid ?? 0) *
          (item.premium ?? 0))
    );
  } else if (item.item_type === "scrap") {
    const spot = spots?.find((s: PricingSpot) => s.name === item.scrap?.metal);
    return (
      item.price ??
      (item?.scrap?.content ?? 0) * ((spot!.bid ?? 0) * (item.premium ?? item?.scrap?.bid_premium ?? 0))
    );
  }
}

export function getBullionTotal(items: PurchaseOrderItem[], spots: Spots): number {
  return items.reduce((acc: number, item: PurchaseOrderItem) => {
    const spot = spots?.find((s: PricingSpot) => s.name === item.product?.metal_type);
    const price =
      item.price ??
      (item?.product?.content ?? 0) *
        ((spot!.bid ?? 0) *
          (item.premium ?? 0));
    const quantity = item.quantity ?? 1;
    return acc + price * quantity;
  }, 0);
}

export function getScrapTotal(items: PurchaseOrderItem[], spots: Spots): number {
  return items.reduce((acc: number, item: PurchaseOrderItem) => {
    const spot = spots?.find((s: PricingSpot) => s.name === item.scrap?.metal);
    const price =
      item.price ??
      (item?.scrap?.content ?? 0) * ((spot!.bid ?? 0) * (item.premium ?? item?.scrap?.bid_premium ?? 0));
    return acc + price;
  }, 0);
}
