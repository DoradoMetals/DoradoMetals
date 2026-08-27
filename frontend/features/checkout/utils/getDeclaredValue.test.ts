// The declared value on a shipping label.
//
// This is what the parcel is insured for, so it is the number that decides
// what a customer gets back if a box of gold goes missing. Under-declaring
// costs them; over-declaring costs the business in premium.
//
// Two things in here are easy to miss and both are pinned below: the $50,000
// cap, and that a scrap line with no premium falls back to 1 while a product
// line falls back to 0.
import { describe, expect, test } from "vitest";
import { getReturnDeclaredValue } from "@/features/checkout/utils/getDeclaredValue";
import type { PurchaseOrder } from "@/features/orders/purchaseOrders/types";
import type { SpotPrice } from "@/features/spots/types";

const spots = (bid: number, type = "Gold") =>
  [{ name: type, bid }] as unknown as SpotPrice[];

const order = (items: unknown[]) => ({ order_items: items }) as unknown as PurchaseOrder;

const scrapItem = (content: number, premium?: number, price?: number) => ({
  item_type: "scrap",
  price: price ?? null,
  premium: premium ?? null,
  scrap: { metal: "Gold", content, bid_premium: premium ?? null },
});

const productItem = (content: number, premium?: number, quantity = 1) => ({
  item_type: "product",
  price: null,
  premium: premium ?? null,
  quantity,
  product: { metal_type: "Gold", content, bid_premium: premium ?? null },
});

describe("getReturnDeclaredValue", () => {
  test("sums scrap lines at content * spot * premium", () => {
    const value = getReturnDeclaredValue(order([scrapItem(1, 0.9)]), spots(3000), []);
    expect(value).toBeCloseTo(2700, 10);
  });

  test("multiplies product lines by their quantity", () => {
    const value = getReturnDeclaredValue(order([productItem(1, 0.9, 3)]), spots(3000), []);
    expect(value).toBeCloseTo(8100, 10);
  });

  // An order locks its spot prices when the offer is accepted, and those must
  // win over whatever the market is doing when the label is printed.
  test("prefers the order's locked spot over the current one", () => {
    const value = getReturnDeclaredValue(
      order([scrapItem(1, 1)]),
      spots(3000),
      spots(2000)
    );
    expect(value).toBeCloseTo(2000, 10);
  });

  // A settled line has a price already; recomputing it would quietly re-price
  // the parcel at today's spot.
  test("uses a line's settled price in preference to recomputing", () => {
    const value = getReturnDeclaredValue(
      order([scrapItem(1, 0.9, 1234.56)]),
      spots(3000),
      []
    );
    expect(value).toBeCloseTo(1234.56, 10);
  });

  // The asymmetry. A scrap line with no premium anywhere is valued at full
  // spot; a product line with no premium is valued at nothing. Neither is
  // obviously wrong - scrap is bought at a discount that defaults to none,
  // where a product without a premium has no price - but they are different
  // rules and the difference is invisible at the call site.
  test("a missing premium means full spot for scrap and nothing for a product", () => {
    expect(getReturnDeclaredValue(order([scrapItem(1)]), spots(3000), []))
      .toBeCloseTo(3000, 10);
    expect(getReturnDeclaredValue(order([productItem(1)]), spots(3000), []))
      .toBe(0);
  });

  // The cap. A parcel worth more than $50,000 is declared at $50,000, which is
  // a carrier limit rather than a valuation - so the customer is underinsured
  // on anything above it, deliberately.
  test("caps the declared value at fifty thousand", () => {
    const value = getReturnDeclaredValue(
      order([scrapItem(100, 1)]),
      spots(3000),
      []
    );
    expect(value).toBe(50000);
  });

  test("an order with no items declares nothing", () => {
    expect(getReturnDeclaredValue(order([]), spots(3000), [])).toBe(0);
  });

  // A metal with no spot at all - a new metal, or a feed that failed - values
  // the line at zero rather than throwing. The parcel still ships, underdeclared.
  test("a line whose metal has no spot price is worth nothing", () => {
    expect(getReturnDeclaredValue(order([scrapItem(1, 0.9)]), spots(3000, "Silver"), []))
      .toBe(0);
  });
});
