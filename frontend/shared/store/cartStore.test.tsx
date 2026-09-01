import { beforeEach, describe, expect, test } from "vitest";

import { cartStore } from "@/shared/store/cartStore";
import type { Product } from "@/features/products/types";

// The buy cart's line arithmetic, pinned - the sell side's sibling suite is
// sellCartStore.test.tsx. (.tsx for the jsdom lane: the store persists
// through localStorage.)

const product = (name: string, quantity?: number): Product =>
  ({ name, ...(quantity != null ? { quantity } : {}) } as Product);

beforeEach(() => {
  localStorage.clear();
  cartStore.setState({ items: [] });
});

describe("line arithmetic", () => {
  test("adding the same product increments one line", () => {
    cartStore.getState().addItem(product("Gold Coin (1oz)"));
    cartStore.getState().addItem(product("Gold Coin (1oz)"));

    const items = cartStore.getState().items;
    expect(items).toHaveLength(1);
    expect(items[0].quantity).toBe(2);
  });

  test("removeOne decrements, then drops the line at one", () => {
    cartStore.getState().addItem(product("Gold Coin (1oz)"));
    cartStore.getState().addItem(product("Gold Coin (1oz)"));

    cartStore.getState().removeOne(product("Gold Coin (1oz)"));
    expect(cartStore.getState().items[0].quantity).toBe(1);

    cartStore.getState().removeOne(product("Gold Coin (1oz)"));
    expect(cartStore.getState().items).toHaveLength(0);
  });

  test("setItems collapses duplicate names into summed quantities", () => {
    cartStore.getState().setItems([
      product("Silver Bar (100 oz)", 2),
      product("Silver Bar (100 oz)", 3),
      product("Gold Coin (1oz)"),
    ]);

    const items = cartStore.getState().items;
    expect(items).toHaveLength(2);
    expect(items.find((i) => i.name === "Silver Bar (100 oz)")?.quantity).toBe(5);
    expect(items.find((i) => i.name === "Gold Coin (1oz)")?.quantity).toBe(1);
  });
});

describe("merging the backend cart on sign-in", () => {
  test("backend lines win by name; local-only lines survive", () => {
    cartStore.getState().setItems([product("Shared Coin", 5), product("Local Only", 2)]);

    cartStore.getState().mergeCartItems([product("Shared Coin", 1), product("Backend Only", 4)]);

    const items = cartStore.getState().items;
    expect(items.find((i) => i.name === "Shared Coin")?.quantity).toBe(1);
    expect(items.find((i) => i.name === "Local Only")?.quantity).toBe(2);
    expect(items.find((i) => i.name === "Backend Only")?.quantity).toBe(4);
    expect(items).toHaveLength(3);
  });
});
