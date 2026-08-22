// What a scrap line is worth: content * (bid spot * premium).
//
// The same arithmetic the API does in calculateItemPrice. This is the number a
// customer is quoted before they post their gold, so it is worth stating what
// it does when something is missing - which is where it is least obvious.
import { describe, expect, test } from "vitest";
import getScrapPrice from "@/features/scrap/utils/getScrapPrice";
import type { SpotPrice } from "@/features/spots/types";

const spot = (bid: number) => ({ bid_spot: bid }) as SpotPrice;

describe("getScrapPrice", () => {
  test("multiplies content by the discounted spot", () => {
    // A troy ounce of gold at 3000, paid at 90%.
    expect(getScrapPrice(1, 0.9, spot(3000))).toBeCloseTo(2700, 10);
    expect(getScrapPrice(0.5, 0.8, spot(1000))).toBeCloseTo(400, 10);
  });

  test("scales linearly with content", () => {
    const one = getScrapPrice(1, 0.9, spot(3000));
    expect(getScrapPrice(3, 0.9, spot(3000))).toBeCloseTo(one * 3, 10);
  });

  // Every falsy input collapses to zero, including a legitimate one. A line
  // with no spot price yet, or a premium not resolved from the rate bands, is
  // quoted at nothing rather than as unknown - and a zero price looks like a
  // real answer on screen. Worth knowing before trusting a zero.
  test("anything missing prices the line at zero, not at an error", () => {
    expect(getScrapPrice(1, 0.9, undefined)).toBe(0);
    expect(getScrapPrice(0, 0.9, spot(3000))).toBe(0);
    expect(getScrapPrice(1, 0, spot(3000))).toBe(0);
  });

  // Follows from the same guard, and is the case most likely to be a real line:
  // a premium of exactly 1 is fine, but a content of 0 is a line someone has
  // not weighed yet.
  test("a premium of 1 pays full spot", () => {
    expect(getScrapPrice(2, 1, spot(1500))).toBeCloseTo(3000, 10);
  });
});
