// WHAT THE BUSINESS PAYS FOR METAL - the bid side of features/pricing.
//
// Moved here from features/purchase-orders/utils/calculations.ts under ruling
// 24: "We should have one area of the app for pricing... nowhere else should
// call pricing except for that one service." It was a module owned by ONE
// feature and imported by SIX, which is a service in the wrong place. Nothing
// below changed in the move - see service.ts for what was added around it.
//
// What an order is worth.
//
// Every scrap branch here used to read `item.premium` on its own while every
// product branch fell back to the row's own premium - `item.premium ??
// item?.product?.bid_premium ?? 0`. That asymmetry was an oversight, not a
// rule, and it valued a scrap line at zero whenever its premium was null.
//
// It was found by comparing the two PDFs a customer receives. Purchase order
// 239 in dev holds one troy ounce of gold with a null premium and a scrap
// bid_premium of 0.75: the invoice, which uses calculateTotalPrice, put the
// order at $4,744.11, and the packing list, which had its own copy of the sum
// with the fallback, put it at $7,980.22. The gold was worth $3,236.11 and the
// invoice said nothing.
//
// calculateReturnDeclaredValue is the worse one - it is the declared value on a
// return shipment, so the same item would have been posted back uninsured.
//
// No production order changes: of 81 scrap lines in production, zero have a
// null premium. This can only ever have understated, never overstated.
// TYPESCRIPT NOTES, because two of the choices below look wrong and are not.
//
// `spot` is `PricingSpot | undefined` - Array.prototype.find says so - and
// every use dereferences it with `!` rather than guarding it. That is
// deliberate and locked in by a test: "a metal absent from spots throws"
// asserts a TypeError specifically. Writing `spot?.bid` would turn a loud
// failure into `undefined * content` = NaN, and a NaN would travel all the way
// to a payout. An order priced against a metal with no spot must stop, not
// quietly become nothing.
//
// The `!` is therefore documentation rather than a shortcut: it says "this can
// be undefined and the throw is the intended behaviour". Adding an explicit
// `throw new Error(...)` would be clearer English and would break that test,
// because the error class would change.
//
// `bid` IS NULLABLE, and the `?? 0` on it is behaviour-preserving rather
// than a fix. JavaScript already evaluates `null * premium` as 0, so this
// changes nothing at run time - it makes the intent explicit and lets the
// checker see it. An unquoted metal prices at nothing.
//
// That sounds like the premium bug in the header and is not. Checked against
// production: 5 scrap lines are currently priced against a metal whose frozen
// bid is null, and every one of them belongs to an order that is In
// Transit or Cancelled - a spot is frozen when the offer is made, so an order
// nobody has quoted yet correctly has no price. The dangerous version would be
// a null spot on a priced order, and there are none.
//
// The item type is ComposedItem, the API's own assembled line
// (D84: the item's product speaks the schema's names now). `scrap` is always
// present as an object - the repo builds it with jsonb_build_object, so a
// bullion line carries a scrap object of nulls rather than null - and the
// optional chaining stays: it describes what a hand-built test fixture might
// omit, not what the API sends. `product` is nullable on the Next wire, so
// its accesses chain too; at runtime the repos still emit an object of nulls.
// THE COMPOSED LINE IS AN INTERNAL SHAPE, NOT A CONTRACT (wave 3). It was
// the PurchaseOrderItem wire schema until the order wire slimmed; the wire
// serves orders.items rows verbatim now, and the assembled line with its
// scrap and product members survives only inside the API, where pricing and
// the confirmation email genuinely need an order put back together.
// WHAT THESE FUNCTIONS NEED OF A LINE, rather than the whole assembled shape.
//
// This was `ComposedItem`, which declares ten required fields where the sums
// below read six - all through optional chaining, because a hand-built fixture
// and an /orders/:id/items body do not carry a whole composed line. tsc never
// saw the mismatch: **/*.test.js is excluded from the project, so the fixtures
// that prove it were invisible (ruling 33). Renaming the tests to TypeScript
// produced eleven errors, every one of them this.
//
// The ask side has always declared the subset it reads, for exactly this reason
// - see `PriceableItem` in ask.ts - so this is the bid side catching up rather
// than a new stance. A ComposedItem still satisfies it; nothing about what is
// READ has changed, and every assertion in tests/bid.test.ts passed unedited
// across the change.
export type PriceableLine = {
  item_type?: string | null;
  price?: number | null;
  premium?: number | null;
  quantity?: number | null;
  product?: {
    metal_type?: string | null;
    content?: number | null;
    bid_premium?: number | null;
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
import type { PricingSpot, Spots } from "#features/pricing/spot.ts";

// Declared once, in spot.ts - it was written out identically here and on the
// ask side, and re-exported so every existing importer of this module keeps
// working.
export type { PricingSpot, Spots } from "#features/pricing/spot.ts";

// What these functions need of an order, rather than the whole wire shape. A
// caller passing a full PurchaseOrder satisfies it; the PDF and email code
// passes assembled objects that do not carry every column, and demanding the
// full shape would force casts at those call sites.
type PricedOrder = {
  order_items: PurchaseOrderItem[];
  shipment?: { shipping_charge?: number | null } | null;
  // `payout: { cost: number }` until 2026-08-29, and that was a LIE THE TYPE
  // SYSTEM WAS REPEATING. Every caller reaches here through
  // features/orders/service.ts's `OrderLike`, whose own header says the order
  // is "whatever the caller had… several callers are controllers handing over
  // req.body". So the compiler believed `cost` was a number because a type
  // ASSERTED it, not because anything checked - the same shape as D103 and
  // D129, a coupling nothing enforces dressed as a guarantee.
  //
  // Widened to what the data can actually be. The composed read builds
  // EMPTY_PAYOUT for an order with no payout row (compose.ts), so `cost` is
  // genuinely null on 32 of dev's 48 purchase orders today; a hand-assembled
  // fixture or a
  // request body can omit the key entirely. Both are now expressible, which
  // means `- order.payout.cost` no longer compiles and cannot come back.
  payout?: { cost?: number | null } | null;
};

// EVERY MONEY FIGURE THIS MODULE RETURNS IS A NUMBER OR AN EXCEPTION. NEVER NaN.
//
// THE DEFECT THIS REPLACES, found by lane B on 2026-08-29: the total ended
//
//     const shipping = order.shipment?.shipping_charge ?? 0;
//     return baseTotal - shipping - order.payout.cost;
//
// - one subtrahend defended, the next one not, on consecutive lines. Three
// inputs, three different answers to the same question, and only one of them
// was deliberate:
//
//   payout null            -> TypeError. Loud, and pinned by a test below.
//   payout { cost: null }  -> 0, because JS reads `x - null` as `x - 0`. This
//                             is what EVERY real read produces for an order
//                             with no payout, and it is what the invoice
//                             template itself does one line under the call
//                             (`purchaseOrder.payout?.cost ?? 0`).
//   payout { }             -> *** NaN, SILENTLY, ALL THE WAY TO THE INVOICE. ***
//
// MEASURED BEFORE CHOOSING: `getPurchaseById` on dev's purchase orders with no
// payout row - 32 OF 48 - returns `{ …, cost: null }`, never undefined, so the NaN
// is not reachable through the API's own reads TODAY. It is reachable through
// every hand-assembled order - features/media/pdfs/service.ts casts one with
// `as unknown as`, the emails do the same - and it is one key away at any time,
// because nothing owns the invariant that EMPTY_PAYOUT lists `cost`.
// compose.ts's own header SAID "order.payout.cost therefore gives undefined
// today", which is false for `cost` and true for anything not in that list. An
// invariant nobody owns is not an invariant; that comment is corrected and now
// says the key list is load-bearing and why.
//
// SO THE SPLIT IS BY MEANING, NOT BY NULLISHNESS, and the two halves are:
//
//   ABSENT -> 0. An order with no payout has no payout fee. That is what the
//   data means, it is what the app already does, and it is NOT "waiving the
//   fee" (D117: the fee is data on the row): a payout row carrying a real cost
//   still subtracts it. Defaulting here cannot invoice as though no fee applied
//   when one did, because a row that says 50 says 50.
//
//   PRESENT BUT UNUSABLE -> throw. A value arrived and could not be made into a
//   number. That is the `spot!` case two functions down, where the deliberate
//   TypeError exists precisely because turning a loud failure into a quiet
//   wrong number is the worse trade on a money path.
//
// This DOES change the `payout: null` case from TypeError to 0, deliberately
// and with the failing assertion the old test asked for. The throw there was
// not protecting a number - a null payout has a well-defined meaning, and
// throwing on it would refuse to invoice every order placed before a customer
// picks a payout method. `spot!` is different in kind: an item with no spot
// price cannot be valued at all, so the total would be meaningless rather than
// merely missing a subtrahend. And the scale is the argument: THIRTY-TWO of
// dev's forty-eight purchase orders have no payout row. Throwing would refuse
// to invoice two thirds of them.
function fee(value: unknown, what: string): number {
  if (value == null) return 0;
  const n = Number(value);
  if (!Number.isFinite(n)) {
    throw new TypeError(`${what} is not a number: ${String(value)}`);
  }
  return n;
}

// The last gate, and it earns its place independently of the fees: migration
// 087 had to clean up two `content = 'NaN'` rows that reached the wire as the
// STRING "NaN", so a non-finite line total is a thing this database has
// actually produced. A total that cannot be computed must stop here rather than
// be printed on a document a customer is paid against.
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
            (item.premium ?? item?.product?.bid_premium ?? 0));

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
  const payout = fee(order.payout?.cost, "the payout fee");

  return finite(baseTotal - shipping - payout, "the order total");
}

export function calculateReturnDeclaredValue(order: PricedOrder, spots: Spots): number {
  const total = order.order_items.reduce((acc: number, item: PurchaseOrderItem) => {
    if (item.item_type === "product") {
      const spot = spots?.find((s: PricingSpot) => s.name === item.product?.metal_type);

      const price =
        (item?.product?.content ?? 0) *
        ((spot!.bid ?? 0) *
          (item.premium ?? item?.product?.bid_premium ?? 0));

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

  // Deducts neither fee - a return is insured for what the metal is worth. The
  // finite check still applies, and here it matters most: this number is the
  // declared value on a return shipment, so a NaN posts a customer's metal back
  // uninsured. That is the failure this file's header opens with.
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
          (item.premium ?? item?.product?.bid_premium ?? 0))
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
          (item.premium ?? item?.product?.bid_premium ?? 0));
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
