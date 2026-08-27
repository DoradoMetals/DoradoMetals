// Rate resolution on the frontend.
//
// This file is a 1:1 mirror of the API's resolveRate.js, which says so in its
// own header. The API side has had tests since the pricing functions were
// covered; this side has had none, which is exactly how a mirrored file drifts
// from the thing it mirrors.
//
// The cases below are deliberately the same ones the API test asserts. If the
// two implementations ever disagree, one of the two suites fails - which is the
// only way a duplicated pricing rule stays honest short of deleting one copy.
//
// It matters because a premium resolved differently on the two sides means the
// price a customer is shown is not the price the order is written at.
import { describe, expect, test } from "vitest";
import { formatRate, getRateBand, getRatePct } from "@/features/rates/utils/resolveRate";
import type { Rate } from "@/features/rates/types";

const rates = [
  { metal: "Gold", min_qty: 0, max_qty: 1, scrap_pct: 0.8, bullion_pct: 0.9 },
  { metal: "Gold", min_qty: 1, max_qty: 10, scrap_pct: 0.85, bullion_pct: 0.93 },
  { metal: "Gold", min_qty: 10, max_qty: null, scrap_pct: 0.9, bullion_pct: 0.95 },
  { metal: "Silver", min_qty: 0, max_qty: null, scrap_pct: 0.7, bullion_pct: 0.88 },
] as unknown as Rate[];

describe("getRateBand", () => {
  test("picks the band containing the quantity", () => {
    expect(getRateBand(rates, "Gold", 5)?.scrap_pct).toBe(0.85);
    expect(getRateBand(rates, "Gold", 50)?.scrap_pct).toBe(0.9);
  });

  // Tiering is on the order total for a metal, so a quantity outside every band
  // still has to price - clamping rather than returning nothing.
  test("clamps below the lowest and above the highest band", () => {
    expect(getRateBand(rates, "Gold", -1)?.scrap_pct).toBe(0.8);
    expect(getRateBand(rates, "Gold", 1e9)?.scrap_pct).toBe(0.9);
  });

  test("matches the metal case-insensitively and ignoring padding", () => {
    expect(getRateBand(rates, "  gOLd ", 5)?.scrap_pct).toBe(0.85);
  });

  test("returns null for a metal with no bands", () => {
    expect(getRateBand(rates, "Platinum", 5)).toBeNull();
    expect(getRateBand([], "Gold", 5)).toBeNull();
  });

  // Bands share their edges - 1 is both the top of the first and the bottom of
  // the second - so which one wins has to be pinned rather than left to sort
  // order. The lower band takes it.
  test("a quantity on a band boundary takes the lower band", () => {
    expect(getRateBand(rates, "Gold", 1)?.scrap_pct).toBe(0.8);
    expect(getRateBand(rates, "Gold", 10)?.scrap_pct).toBe(0.85);
  });
});

describe("getRatePct", () => {
  test("selects scrap or bullion from the resolved band", () => {
    expect(getRatePct(rates, "Gold", 5, "scrap")).toBe(0.85);
    expect(getRatePct(rates, "Gold", 5, "bullion")).toBe(0.93);
  });

  test("returns undefined when there is nothing to resolve", () => {
    expect(getRatePct([], "Gold", 5, "scrap")).toBeUndefined();
    expect(getRatePct(null, "Gold", 5, "scrap")).toBeUndefined();
    expect(getRatePct(rates, "Platinum", 5, "scrap")).toBeUndefined();
  });

  // The fractions plug straight into `bid * premium`, so a percentage
  // leaking through instead of a fraction would multiply a price by ninety.
  test("resolves to a fraction, never a percentage", () => {
    for (const metal of ["Gold", "Silver"]) {
      for (const qty of [0, 0.5, 5, 100]) {
        const pct = getRatePct(rates, metal, qty, "scrap");
        expect(pct).toBeGreaterThan(0);
        expect(pct).toBeLessThanOrEqual(1);
      }
    }
  });
});

describe("formatRate", () => {
  test("renders a fraction as a percentage", () => {
    expect(formatRate(0.9)).toBe("90%");
    expect(formatRate(0.925)).toBe("92.5%");
  });

  // Accepts an already-percent value, which is the ambiguity in the function:
  // 1 is a fraction and reads as 100%, but 1.5 is treated as 1.5%.
  test("passes through a value already above one", () => {
    expect(formatRate(1)).toBe("100%");
    expect(formatRate(1.5)).toBe("1.5%");
  });

  test("renders nothing as an em dash rather than NaN", () => {
    expect(formatRate(null)).toBe("—");
    expect(formatRate(undefined)).toBe("—");
  });
});
