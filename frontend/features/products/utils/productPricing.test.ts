// Pricing a bullion product.
//
// Four helpers, all one line each, and between them they decide what a customer
// pays and what the business offers. They are worth testing precisely because
// they are short: the mistake they invite is not a wrong formula but the wrong
// pair of inputs - a bid price computed from the ask spot, or a premium applied
// to the wrong side - and that is invisible on inspection.
import { describe, expect, test } from "vitest";
import getProductBidPrice from "@/features/products/utils/getProductBidPrice";
import getProductPrice from "@/features/products/utils/getProductPrice";
import getProductBidOverUnderSpot from "@/features/products/utils/getProductBidOverUnderSpot";
import getProductAskOverUnderSpot from "@/features/products/utils/getProductAskOverUnderSpot";
import type { Product } from "@/features/products/types";
import type { SpotPrice } from "@/features/spots/types";

const product = (over: Partial<Product> = {}) =>
  ({ content: 1, bid_premium: 0.97, ask_premium: 1.05, ...over }) as Product;

// Deliberately different bid and ask, so a helper reaching for the wrong one
// produces a different number rather than the same one by luck.
const spot = { bid: 3000, ask: 3050 } as SpotPrice;

describe("what a customer pays and what we offer", () => {
  test("the ask price uses the ask spot and the ask premium", () => {
    expect(getProductPrice(product(), spot)).toBeCloseTo(1 * 3050 * 1.05, 10);
  });

  test("the bid price uses the bid spot and the bid premium", () => {
    expect(getProductBidPrice(product(), spot)).toBeCloseTo(1 * 3000 * 0.97, 10);
  });

  // The two sides must never converge: we buy below spot and sell above it, and
  // a helper crossing over would quietly invert the business's margin.
  test("we offer less than we charge", () => {
    expect(getProductBidPrice(product(), spot)).toBeLessThan(
      getProductPrice(product(), spot)
    );
  });

  test("both scale with content", () => {
    const tenth = product({ content: 0.1 });
    expect(getProductPrice(tenth, spot) * 10).toBeCloseTo(getProductPrice(product(), spot), 8);
    expect(getProductBidPrice(tenth, spot) * 10).toBeCloseTo(getProductBidPrice(product(), spot), 8);
  });
});

describe("over and under spot", () => {
  // The invariant tying the four together: what a product costs, minus what it
  // costs over melt, is melt. If either helper changed independently this fails.
  test("price minus the premium over spot is the melt value", () => {
    const melt = 1 * 3050;
    expect(
      getProductPrice(product(), spot) - getProductAskOverUnderSpot(product(), spot)
    ).toBeCloseTo(melt, 8);

    const bidMelt = 1 * 3000;
    expect(
      getProductBidPrice(product(), spot) - getProductBidOverUnderSpot(product(), spot)
    ).toBeCloseTo(bidMelt, 8);
  });

  test("a premium above one is over spot, below one is under", () => {
    expect(getProductAskOverUnderSpot(product({ ask_premium: 1.05 }), spot)).toBeGreaterThan(0);
    expect(getProductBidOverUnderSpot(product({ bid_premium: 0.97 }), spot)).toBeLessThan(0);
  });

  test("a premium of exactly one is neither over nor under", () => {
    expect(getProductAskOverUnderSpot(product({ ask_premium: 1 }), spot)).toBe(0);
    expect(getProductBidOverUnderSpot(product({ bid_premium: 1 }), spot)).toBe(0);
  });
});

describe("missing inputs", () => {
  // Three of the four guard the product; getProductPrice does not, and its
  // signature says the product is required. Called with undefined it throws
  // rather than returning zero - a difference worth knowing, since the other
  // three invite the assumption that all of them are safe.
  test("a missing spot prices at zero rather than NaN", () => {
    expect(getProductBidPrice(product(), undefined)).toBe(0);
    expect(getProductPrice(product(), undefined)).toBe(0);
    expect(getProductBidOverUnderSpot(product(), undefined)).toBe(0);
    expect(getProductAskOverUnderSpot(product(), undefined)).toBe(0);
  });

  test("only getProductPrice requires its product", () => {
    expect(getProductBidPrice(undefined, spot)).toBe(0);
    expect(getProductBidOverUnderSpot(undefined, spot)).toBe(0);
    expect(getProductAskOverUnderSpot(undefined, spot)).toBe(0);
    expect(() => getProductPrice(undefined as unknown as Product, spot)).toThrow();
  });
});
