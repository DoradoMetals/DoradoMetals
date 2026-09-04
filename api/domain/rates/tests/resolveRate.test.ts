import { test } from "vitest";
import assert from "node:assert/strict";
import {
  getRateBand,
  getRatePct,
  sumContentByMetal,
} from "#domain/rates/utils/resolveRate.ts";
import type { RateRead } from "@dorado/contracts";

const rates: RateRead[] = [
  { id: "r1", unit: "troy_oz", metal: "Gold", min_qty: 0, max_qty: 1, scrap_pct: 0.8, bullion_pct: 0.9 },
  { id: "r2", unit: "troy_oz", metal: "Gold", min_qty: 1, max_qty: 10, scrap_pct: 0.85, bullion_pct: 0.93 },
  { id: "r3", unit: "troy_oz", metal: "Gold", min_qty: 10, max_qty: null, scrap_pct: 0.9, bullion_pct: 0.96 },
  { id: "r4", unit: "troy_oz", metal: "Silver", min_qty: 0, max_qty: null, scrap_pct: 0.7, bullion_pct: 0.8 },
];

const bandPct = (metal: string, qty: number): number => {
  const band = getRateBand(rates, metal, qty);
  assert.ok(band, `no band resolved for ${metal} at ${qty}`);
  return band.scrap_pct;
};

test("getRateBand picks the band containing the quantity", () => {
  assert.equal(bandPct("Gold", 5), 0.85);
  assert.equal(bandPct("Gold", 50), 0.9);
});

test("getRateBand clamps below the lowest and above the highest band", () => {
  assert.equal(bandPct("Gold", -1), 0.8);
  assert.equal(bandPct("Gold", 1e9), 0.9);
});

test("getRateBand matches the metal case-insensitively and ignoring padding", () => {
  assert.equal(bandPct("  gOLd ", 5), 0.85);
});

test("getRateBand returns null for a metal with no bands", () => {
  assert.equal(getRateBand(rates, "Platinum", 5), null);
  assert.equal(getRateBand([], "Gold", 5), null);
});

test("a quantity on a band boundary takes the lower band", () => {
  assert.equal(bandPct("Gold", 1), 0.8);
  assert.equal(bandPct("Gold", 10), 0.85);
});

test("getRatePct selects scrap or bullion from the resolved band", () => {
  assert.equal(getRatePct(rates, "Gold", 5, "scrap"), 0.85);
  assert.equal(getRatePct(rates, "Gold", 5, "bullion"), 0.93);
});

test("getRatePct returns undefined when there is nothing to resolve", () => {
  assert.equal(getRatePct([], "Gold", 5, "scrap"), undefined);
  assert.equal(getRatePct(null, "Gold", 5, "scrap"), undefined);
  assert.equal(getRatePct(rates, "Platinum", 5, "scrap"), undefined);
});

test("getRatePct returns undefined when the band has no pct for that material", () => {
  // @ts-expect-error - a null pct is exactly what this test is about
  const missing: RateRead[] = [{ metal: "Gold", min_qty: 0, max_qty: null, scrap_pct: null }];
  assert.equal(getRatePct(missing, "Gold", 1, "scrap"), undefined);
});

test("getRatePct coerces a numeric-as-string pct", () => {
  // @ts-expect-error - a numeric-as-string pct is exactly what this test is about
  const strings: RateRead[] = [{ metal: "Gold", min_qty: 0, max_qty: null, scrap_pct: "0.85" }];
  assert.equal(getRatePct(strings, "Gold", 1, "scrap"), 0.85);
});

test("sumContentByMetal totals per metal under a lowercased key", () => {
  const items = [
    { metal: "Gold", content: 1.5 },
    { metal: "gold", content: 2 },
    { metal: "Silver", content: 10 },
  ];
  const totals = sumContentByMetal(items, (i) => i.metal, (i) => i.content);
  assert.deepEqual(totals, { gold: 3.5, silver: 10 });
});

test("sumContentByMetal skips items with no metal and treats junk content as zero", () => {
  const items = [
    { metal: null, content: 99 },
    { metal: "Gold", content: "not a number" },
    { metal: "Gold", content: "2.5" },
  ];
  const totals = sumContentByMetal(items, (i) => i.metal, (i) => i.content);
  assert.deepEqual(totals, { gold: 2.5 });
});

test("sumContentByMetal handles no items", () => {
  assert.deepEqual(
    sumContentByMetal(null, (i: { metal: unknown; content: unknown }) => i.metal, (i) => i.content),
    {}
  );
});
