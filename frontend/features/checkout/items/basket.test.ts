import { describe, expect, test } from "vitest";

import { addLine, addOne, collapse, dropAll, dropOne } from "@/features/checkout/items/basket";
import type { CheckoutItem, CheckoutItemPatch } from "@dorado/contracts";

// THE BASKET'S LINE ARITHMETIC, pinned - the functions that compose the next
// `PUT /checkout/items` out of the rows the server last answered with. It was a
// zustand store's methods until ruling 63 made the basket server rows for
// everybody, visitors included; the arithmetic survived the store because
// building a request is not holding data.
//
// The three quantity functions take a ROW ID rather than a line to re-match:
// the server answered every row it holds, so each one has one. Only `addLine`
// takes a patch, because a thing not yet in the basket has no row id yet.

const row = (over: Partial<CheckoutItem> = {}): CheckoutItem => ({
  id: "row-1",
  bullion_id: null,
  metal_id: null,
  checkout_id: "c-1",
  pre_melt: null,
  post_melt: null,
  purity: null,
  premium: null,
  quantity: 1,
  created_by: null,
  updated_by: null,
  created_at: "2026-09-06T00:00:00.000Z",
  updated_at: "2026-09-06T00:00:00.000Z",
  content: null,
  unit: null,
  ...over,
});

const coinRow = (id: string, bullion_id: string, quantity = 1): CheckoutItem =>
  row({ id, bullion_id, quantity });

const lotRow = (id: string, over: Partial<CheckoutItem> = {}): CheckoutItem =>
  row({ id, metal_id: "Gold", pre_melt: 10, purity: 0.585, unit: "g", ...over });

const coin = (bullion_id: string, quantity = 1): CheckoutItemPatch => ({ bullion_id, quantity });

const lot = (over: Partial<Extract<CheckoutItemPatch, { metal_id: string }>> = {}) => ({
  metal_id: "Gold",
  pre_melt: 10,
  purity: 0.585,
  unit: "g",
  quantity: 1,
  ...over,
});

describe("line arithmetic", () => {
  test("adding a product already in the basket is one line with quantity two", () => {
    const items = addLine([coinRow("r-1", "p-1")], coin("p-1"));
    expect(items).toHaveLength(1);
    expect(items[0].quantity).toBe(2);
  });

  test("a declared lot matching one already in the basket collapses into it", () => {
    const items = addLine([lotRow("r-1")], lot());
    expect(items).toHaveLength(1);
    expect(items[0].quantity).toBe(2);
  });

  test("declared lots with different weights are separate lines", () => {
    const items = addLine([lotRow("r-1")], lot({ pre_melt: 20 }));
    expect(items).toHaveLength(2);
  });

  test("addOne increments the named row and leaves its siblings alone", () => {
    const items = addOne([coinRow("r-1", "p-1"), coinRow("r-2", "p-2")], "r-1");
    expect(items).toHaveLength(2);
    expect(items[0].quantity).toBe(2);
    expect(items[1].quantity).toBe(1);
  });

  test("dropOne decrements, then drops the line at one", () => {
    const two = [coinRow("r-1", "p-1", 2)];
    expect(dropOne(two, "r-1")[0].quantity).toBe(1);
    expect(dropOne([coinRow("r-1", "p-1", 1)], "r-1")).toHaveLength(0);
  });

  test("dropAll drops the whole line regardless of quantity", () => {
    expect(dropAll([coinRow("r-1", "p-1", 3)], "r-1")).toHaveLength(0);
  });

  test("collapse sums duplicate lines", () => {
    const items = collapse([coin("p-1", 2), coin("p-1", 3), coin("p-2")]);
    expect(items).toHaveLength(2);
    expect(items.find((i) => "bullion_id" in i && i.bullion_id === "p-1")?.quantity).toBe(5);
    expect(items.find((i) => "bullion_id" in i && i.bullion_id === "p-2")?.quantity).toBe(1);
  });

  test("the rows handed in are never mutated", () => {
    // They are the query cache's own rows: mutating them would change what
    // every other component reading that cache entry renders, before the PUT
    // that was supposed to change it had even been sent.
    const before = [coinRow("r-1", "p-1", 2)];
    addLine(before, coin("p-1"));
    addOne(before, "r-1");
    dropOne(before, "r-1");
    dropAll(before, "r-1");
    expect(before).toEqual([coinRow("r-1", "p-1", 2)]);
  });
});
