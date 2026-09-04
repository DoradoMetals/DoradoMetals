import { describe, expect, test } from "vitest";

import { addLine, collapse, removeAll, removeOne } from "@/features/checkout/items/basket";
import type { CheckoutLine } from "@/features/checkout/items/types";

// THE BASKET'S LINE ARITHMETIC, pinned - the functions that compose the next
// `PUT /checkout/items` out of the rows the server last answered with. It was a
// zustand store's methods until ruling 63 made the basket server rows for
// everybody, visitors included; the arithmetic survived the store because
// building a request is not holding data.
//
// Plain node lane now, not jsdom: nothing persists, so there is no localStorage
// to clear and no state to reset between tests. Every value column is the API's
// CheckoutItemPatch; nothing here computes a price or a premium - that died
// with the client-held rate bands (ruling 51: "premium is on the row").

const coin = (bullion_id: string, quantity = 1): CheckoutLine => ({
  id: bullion_id,
  bullion_id,
  quantity,
});

const lot = (over: Partial<CheckoutLine> = {}): CheckoutLine => ({
  id: over.id ?? "lot-1",
  metal_id: "m-au",
  pre_melt: 10,
  purity: 0.585,
  unit: "g",
  quantity: 1,
  ...over,
});

describe("line arithmetic", () => {
  test("adding the same product twice is one line with quantity two", () => {
    const items = addLine(addLine([], coin("p-1")), coin("p-1"));
    expect(items).toHaveLength(1);
    expect(items[0].quantity).toBe(2);
  });

  test("two identical declared lots are one line with quantity two", () => {
    const items = addLine(addLine([], lot()), lot());
    expect(items).toHaveLength(1);
    expect(items[0].quantity).toBe(2);
  });

  test("declared lots with different weights are separate lines", () => {
    const items = addLine(
      addLine([], lot({ id: "a", pre_melt: 10 })),
      lot({ id: "b", pre_melt: 20 })
    );
    expect(items).toHaveLength(2);
  });

  test("removeOne decrements, then drops the line at one", () => {
    const two = addLine(addLine([], coin("p-1")), coin("p-1"));
    const one = removeOne(two, coin("p-1"));
    expect(one[0].quantity).toBe(1);
    expect(removeOne(one, coin("p-1"))).toHaveLength(0);
  });

  test("removeAll drops the whole line regardless of quantity", () => {
    expect(removeAll(addLine([], coin("p-1", 3)), coin("p-1"))).toHaveLength(0);
  });

  test("collapse sums duplicate lines", () => {
    const items = collapse([coin("p-1", 2), coin("p-1", 3), coin("p-2")]);
    expect(items).toHaveLength(2);
    expect(items.find((i) => i.bullion_id === "p-1")?.quantity).toBe(5);
    expect(items.find((i) => i.bullion_id === "p-2")?.quantity).toBe(1);
  });

  test("the input list is never mutated", () => {
    // The lines handed in are the query cache's own rows: mutating them would
    // change what every other component reading that cache entry renders,
    // before the PUT that was supposed to change it had even been sent.
    const before = [coin("p-1", 2)];
    addLine(before, coin("p-1"));
    removeOne(before, coin("p-1"));
    removeAll(before, coin("p-1"));
    expect(before).toEqual([coin("p-1", 2)]);
  });
});
