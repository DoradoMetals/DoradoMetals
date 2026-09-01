import { beforeEach, describe, expect, test } from "vitest";

import { sellCartStore } from "@/shared/store/sellCartStore";
import type { SellCartItem } from "@/features/cart/types";
import type { Scrap } from "@/features/scrap/types";
import type { Product } from "@/features/products/types";
import type { Rate } from "@/features/rates/types";

// The sell cart's money behaviour, pinned. This store previews the premium the
// backend will enforce at order creation - retierScrap mirrors the API's rate
// banding - so a regression here misquotes a customer until the server
// corrects them at submit. (.tsx so it runs in the jsdom lane: the store
// persists through localStorage.)

const product = (name: string, quantity = 1): SellCartItem => ({
  type: "product",
  data: { name, quantity } as Product,
});

const scrap = (over: Partial<Scrap> = {}): SellCartItem => ({
  type: "scrap",
  data: {
    metal: "Gold",
    pre_melt: 10,
    purity: 0.585,
    gross_unit: "g",
    content: 5,
    bid_premium: 0.5,
    quantity: 1,
    ...over,
  } as Scrap,
});

// Two gold bands: up to 10 units pays 90%, above pays 95%.
const goldBands: Rate[] = [
  { metal: "Gold", min_qty: 0, max_qty: 10, scrap_pct: 0.9, bullion_pct: 0.98 } as Rate,
  { metal: "Gold", min_qty: 10.0001, max_qty: null, scrap_pct: 0.95, bullion_pct: 0.99 } as Rate,
];

const premiums = () =>
  sellCartStore
    .getState()
    .items.filter((i) => i.type === "scrap")
    .map((i) => (i.data as Scrap).bid_premium);

beforeEach(() => {
  localStorage.clear();
  sellCartStore.setState({ items: [], rates: [] });
});

describe("adding and merging lines", () => {
  test("the same product added twice is one line with quantity two", () => {
    sellCartStore.getState().addItem(product("Silver Bar (100 oz)"));
    sellCartStore.getState().addItem(product("Silver Bar (100 oz)"));

    const items = sellCartStore.getState().items;
    expect(items).toHaveLength(1);
    expect(items[0].data.quantity).toBe(2);
  });

  test("scrap identity excludes bid_premium, so a re-tiered line still merges", () => {
    sellCartStore.getState().addItem(scrap({ bid_premium: 0.9 }));
    sellCartStore.getState().addItem(scrap({ bid_premium: 0.95 }));

    const items = sellCartStore.getState().items;
    expect(items).toHaveLength(1);
    expect(items[0].data.quantity).toBe(2);
  });

  test("scrap differing in an intrinsic (purity) stays two lines", () => {
    sellCartStore.getState().addItem(scrap({ purity: 0.585 }));
    sellCartStore.getState().addItem(scrap({ purity: 0.999, pre_melt: 3 }));

    expect(sellCartStore.getState().items).toHaveLength(2);
  });
});

describe("rate tiering across the whole cart", () => {
  test("the band is picked from the metal's TOTAL content, not the line's", () => {
    sellCartStore.getState().setRates(goldBands);

    // 6 units of gold: inside the low band.
    sellCartStore.getState().addItem(scrap({ content: 6 }));
    expect(premiums()).toEqual([0.9]);

    // A second, distinct line takes the metal total to 12: BOTH lines re-tier
    // to the high band - that is the whole point of tiering on the total.
    sellCartStore.getState().addItem(scrap({ content: 6, pre_melt: 99 }));
    expect(premiums()).toEqual([0.95, 0.95]);
  });

  test("without rates the premiums are left alone", () => {
    sellCartStore.getState().addItem(scrap({ bid_premium: 0.5 }));
    sellCartStore.getState().setRates([]);
    expect(premiums()).toEqual([0.5]);
  });

  test("a metal with no band keeps its existing premium", () => {
    sellCartStore.getState().setRates(goldBands);
    sellCartStore.getState().addItem(scrap({ metal: "Palladium", bid_premium: 0.5 }));
    expect(premiums()).toEqual([0.5]);
  });
});

describe("removing lines", () => {
  test("removeOne decrements, then removes the line at quantity one", () => {
    sellCartStore.getState().addItem(product("Gold Coin (1oz)"));
    sellCartStore.getState().addItem(product("Gold Coin (1oz)"));

    sellCartStore.getState().removeOne(product("Gold Coin (1oz)"));
    expect(sellCartStore.getState().items[0].data.quantity).toBe(1);

    sellCartStore.getState().removeOne(product("Gold Coin (1oz)"));
    expect(sellCartStore.getState().items).toHaveLength(0);
  });

  test("removeAll drops the whole line regardless of quantity", () => {
    sellCartStore.getState().addItem(scrap());
    sellCartStore.getState().addItem(scrap());
    sellCartStore.getState().addItem(product("Silver Bar (100 oz)"));

    sellCartStore.getState().removeAll(scrap());

    const items = sellCartStore.getState().items;
    expect(items).toHaveLength(1);
    expect(items[0].type).toBe("product");
  });
});

describe("merging the backend cart on sign-in", () => {
  test("backend products win, local-only lines survive, scrap unions without duplicates", () => {
    sellCartStore.getState().addItem(product("Silver Bar (100 oz)", 3));
    sellCartStore.getState().addItem(product("Local Only Coin"));
    sellCartStore.getState().addItem(scrap());

    sellCartStore.getState().mergeSellCart([
      product("Silver Bar (100 oz)", 1), // backend copy of a local line
      scrap(), // duplicate of the local scrap - must not double
      scrap({ pre_melt: 42 }), // backend-only scrap
    ]);

    const items = sellCartStore.getState().items;
    const silver = items.find(
      (i) => i.type === "product" && (i.data as Product).name === "Silver Bar (100 oz)"
    );
    // The backend's quantity is taken as truth for a product both sides hold.
    expect(silver?.data.quantity).toBe(1);
    expect(
      items.some((i) => i.type === "product" && (i.data as Product).name === "Local Only Coin")
    ).toBe(true);
    expect(items.filter((i) => i.type === "scrap")).toHaveLength(2);
    expect(items).toHaveLength(4);
  });
});
