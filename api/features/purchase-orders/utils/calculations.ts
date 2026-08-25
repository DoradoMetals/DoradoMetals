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
// `spot` is `SpotPriceWire | undefined` - Array.prototype.find says so - and
// every use dereferences it with `!` rather than guarding it. That is
// deliberate and locked in by a test: "a metal absent from spots throws"
// asserts a TypeError specifically. Writing `spot?.bid_spot` would turn a loud
// failure into `undefined * content` = NaN, and a NaN would travel all the way
// to a payout. An order priced against a metal with no spot must stop, not
// quietly become nothing.
//
// The `!` is therefore documentation rather than a shortcut: it says "this can
// be undefined and the throw is the intended behaviour". Adding an explicit
// `throw new Error(...)` would be clearer English and would break that test,
// because the error class would change.
//
// `bid_spot` IS NULLABLE, and the `?? 0` on it is behaviour-preserving rather
// than a fix. JavaScript already evaluates `null * premium` as 0, so this
// changes nothing at run time - it makes the intent explicit and lets the
// checker see it. An unquoted metal prices at nothing.
//
// That sounds like the premium bug in the header and is not. Checked against
// production: 5 scrap lines are currently priced against a metal whose frozen
// bid_spot is null, and every one of them belongs to an order that is In
// Transit or Cancelled - a spot is frozen when the offer is made, so an order
// nobody has quoted yet correctly has no price. The dangerous version would be
// a null spot on a priced order, and there are none.
//
// The item type is PurchaseOrderItemWire from the contracts package. Its
// `scrap` and `product` are always present as objects - the repo builds them
// with jsonb_build_object, so a bullion line carries a scrap object of nulls
// rather than null - which is why the optional chaining on them stays: it
// describes what a hand-built test fixture might omit, not what the API sends.
import type { PurchaseOrderItemWire, SpotPriceWire } from "@dorado/contracts";

// What these functions need of an order, rather than the whole wire shape. A
// caller passing a full PurchaseOrderWire satisfies it; the PDF and email code
// passes assembled objects that do not carry every column, and demanding the
// full shape would force casts at those call sites.
type PricedOrder = {
  order_items: PurchaseOrderItemWire[];
  shipment?: { shipping_charge?: number | null } | null;
  payout: { cost: number };
};

type Spots = SpotPriceWire[] | null | undefined;

export function calculateTotalPrice(order: PricedOrder, spots: Spots): number {
  const baseTotal = order.order_items.reduce((acc: number, item: PurchaseOrderItemWire) => {
    if (item.item_type === "product") {
      const spot = spots?.find((s: SpotPriceWire) => s.type === item.product?.metal_type);

      const price =
        item.price ??
        (item?.product?.content ?? 0) *
          ((spot!.bid_spot ?? 0) *
            (item.premium ?? item?.product?.bid_premium ?? 0));

      const quantity = item.quantity ?? 1;
      return acc + price * quantity;
    }

    if (item.item_type === "scrap") {
      const spot = spots?.find((s: SpotPriceWire) => s.type === item.scrap?.metal);

      const price =
        item.price ??
        (item?.scrap?.content ?? 0) * ((spot!.bid_spot ?? 0) * (item.premium ?? item?.scrap?.bid_premium ?? 0));
      return acc + price;
    }

    return acc;
  }, 0);

  const shipping = order.shipment?.shipping_charge ?? 0;

  return baseTotal - shipping - order.payout.cost;
}

export function calculateReturnDeclaredValue(order: PricedOrder, spots: Spots): number {
  const total = order.order_items.reduce((acc: number, item: PurchaseOrderItemWire) => {
    if (item.item_type === "product") {
      const spot = spots?.find((s: SpotPriceWire) => s.type === item.product?.metal_type);

      const price =
        (item?.product?.content ?? 0) *
        ((spot!.bid_spot ?? 0) *
          (item.premium ?? item?.product?.bid_premium ?? 0));

      const quantity = item.quantity ?? 1;
      return acc + price * quantity;
    }

    if (item.item_type === "scrap") {
      const spot = spots?.find((s: SpotPriceWire) => s.type === item.scrap?.metal);

      const price =
        (item?.scrap?.content ?? 0) * ((spot!.bid_spot ?? 0) * (item.premium ?? item?.scrap?.bid_premium ?? 0));
      return acc + price;
    }

    return acc;
  }, 0);

  return total;
}

export function calculateItemPrice(
  item: PurchaseOrderItemWire,
  spots: Spots
): number | undefined {
  if (item.item_type === "product") {
    const spot = spots?.find((s: SpotPriceWire) => s.type === item.product?.metal_type);
    return (
      item.price ??
      (item?.product.content ?? 0) *
        ((spot!.bid_spot ?? 0) *
          (item.premium ?? item?.product.bid_premium ?? 0))
    );
  } else if (item.item_type === "scrap") {
    const spot = spots?.find((s: SpotPriceWire) => s.type === item.scrap?.metal);
    return (
      item.price ??
      (item?.scrap.content ?? 0) * ((spot!.bid_spot ?? 0) * (item.premium ?? item?.scrap?.bid_premium ?? 0))
    );
  }
}

export function getBullionTotal(items: PurchaseOrderItemWire[], spots: Spots): number {
  return items.reduce((acc: number, item: PurchaseOrderItemWire) => {
    const spot = spots?.find((s: SpotPriceWire) => s.type === item.product?.metal_type);
    const price =
      item.price ??
      (item?.product?.content ?? 0) *
        ((spot!.bid_spot ?? 0) *
          (item.premium ?? item?.product?.bid_premium ?? 0));
    const quantity = item.quantity ?? 1;
    return acc + price * quantity;
  }, 0);
}

export function getScrapTotal(items: PurchaseOrderItemWire[], spots: Spots): number {
  return items.reduce((acc: number, item: PurchaseOrderItemWire) => {
    const spot = spots?.find((s: SpotPriceWire) => s.type === item.scrap?.metal);
    const price =
      item.price ??
      (item?.scrap?.content ?? 0) * ((spot!.bid_spot ?? 0) * (item.premium ?? item?.scrap?.bid_premium ?? 0));
    return acc + price;
  }, 0);
}
