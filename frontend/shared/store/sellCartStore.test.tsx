import { beforeEach, describe, expect, test } from "vitest";

import { sellCartStore } from "@/shared/store/sellCartStore";
import type { SellCartItem } from "@/features/cart/types";
import type { Rate } from "@/features/rates/types";

// The sell basket's behaviour, pinned. (.tsx for the jsdom lane: it persists.)

const line = (over: Partial<SellCartItem> = {}): SellCartItem => ({
  id: over.id ?? "line-1",
  bullion_id: null,
  metal_id: null,
  pre_melt: 10,
  post_melt: null,
  purity: 0.585,
  unit: "g",
  quantity: 1,
  gross: null,
  metal: "Gold",
  name: null,
  image_front: null,
  mint_name: null,
  ...over,
});

const product = (id: string, quantity = 1): SellCartItem =>
  line({ id, bullion_id: id, metal: "Silver", name: id, pre_melt: null, purity: null, unit: null, quantity });

const lot = (over: Partial<SellCartItem> = {}): SellCartItem =>
  line({ id: `lot-${over.pre_melt ?? 10}-${over.purity ?? 0.585}`, ...over });

// Up to 10 troy ounces pays 90%, above pays 95%.
const goldBands: Rate[] = [
  { metal: "Gold", min_qty: 0, max_qty: 10, scrap_pct: 0.9, bullion_pct: 0.98 } as Rate,
  { metal: "Gold", min_qty: 10.0001, max_qty: null, scrap_pct: 0.95, bullion_pct: 0.99 } as Rate,
];

const premiums = () => {
  const { items, premiums } = sellCartStore.getState();
  return items.filter((i) => i.bullion_id === null).map((i) => premiums[i.id]);
};

beforeEach(() => {
  localStorage.clear();
  sellCartStore.setState({ items: [], rates: [], premiums: {} });
});

describe("adding and merging lines", () => {
  test("the same product added twice is one line with quantity two", () => {
    sellCartStore.getState().addItem(product("silver-bar-100"));
    sellCartStore.getState().addItem(product("silver-bar-100"));

    const items = sellCartStore.getState().items;
    expect(items).toHaveLength(1);
    expect(items[0].quantity).toBe(2);
  });

  test("two identical declarations are one line with quantity two", () => {
    sellCartStore.getState().addItem(lot());
    sellCartStore.getState().addItem(lot());

    const items = sellCartStore.getState().items;
    expect(items).toHaveLength(1);
    expect(items[0].quantity).toBe(2);
  });

  test("a declaration differing in an intrinsic (purity) stays two lines", () => {
    sellCartStore.getState().addItem(lot({ purity: 0.585 }));
    sellCartStore.getState().addItem(lot({ purity: 0.999, pre_melt: 3 }));

    expect(sellCartStore.getState().items).toHaveLength(2);
  });

  test("declared lots are labelled per metal in the order they were added", () => {
    sellCartStore.getState().addItem(lot({ pre_melt: 10 }));
    sellCartStore.getState().addItem(lot({ pre_melt: 20 }));

    expect(sellCartStore.getState().items.map((i) => i.name)).toEqual([
      "Gold Item 1",
      "Gold Item 2",
    ]);
  });
});

describe("rate tiering across the whole basket", () => {
  test("the band is picked from the metal's TOTAL content, not the line's", () => {
    sellCartStore.getState().setRates(goldBands);

    sellCartStore.getState().addItem(lot({ pre_melt: 6, unit: "t oz", purity: 1 }));
    expect(premiums()).toEqual([0.9]);

    // A second line takes the total to 12: both re-tier.
    sellCartStore.getState().addItem(lot({ pre_melt: 6, unit: "t oz", purity: 0.999 }));
    expect(premiums()).toEqual([0.95, 0.95]);
  });

  test("without rates no band is previewed", () => {
    sellCartStore.getState().addItem(lot());
    sellCartStore.getState().setRates([]);
    expect(premiums()).toEqual([undefined]);
  });

  test("a metal with no band gets no preview", () => {
    sellCartStore.getState().setRates(goldBands);
    sellCartStore.getState().addItem(lot({ metal: "Palladium" }));
    expect(premiums()).toEqual([undefined]);
  });
});

describe("removing lines", () => {
  test("removeOne decrements, then removes the line at quantity one", () => {
    sellCartStore.getState().addItem(product("gold-coin-1oz"));
    sellCartStore.getState().addItem(product("gold-coin-1oz"));

    sellCartStore.getState().removeOne(product("gold-coin-1oz"));
    expect(sellCartStore.getState().items[0].quantity).toBe(1);

    sellCartStore.getState().removeOne(product("gold-coin-1oz"));
    expect(sellCartStore.getState().items).toHaveLength(0);
  });

  test("removeAll drops the whole line regardless of quantity", () => {
    sellCartStore.getState().addItem(lot());
    sellCartStore.getState().addItem(lot());
    sellCartStore.getState().addItem(product("silver-bar-100"));

    sellCartStore.getState().removeAll(lot());

    const items = sellCartStore.getState().items;
    expect(items).toHaveLength(1);
    expect(items[0].bullion_id).toBe("silver-bar-100");
  });
});

describe("merging the server's basket on sign-in", () => {
  test("the server's copy wins, local-only lines survive, lots union without duplicates", () => {
    sellCartStore.getState().addItem(product("silver-bar-100", 3));
    sellCartStore.getState().addItem(product("local-only-coin"));
    sellCartStore.getState().addItem(lot());

    sellCartStore.getState().mergeSellCart([
      product("silver-bar-100", 1), // the server's copy of a local line
      lot(), // duplicate of the local lot - must not double
      lot({ pre_melt: 42 }), // server-only lot
    ]);

    const items = sellCartStore.getState().items;
    const silver = items.find((i) => i.bullion_id === "silver-bar-100");
    expect(silver?.quantity).toBe(1);
    expect(items.some((i) => i.bullion_id === "local-only-coin")).toBe(true);
    expect(items.filter((i) => i.bullion_id === null)).toHaveLength(2);
    expect(items).toHaveLength(4);
  });
});
