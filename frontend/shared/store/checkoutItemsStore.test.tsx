import { beforeEach, describe, expect, test } from "vitest";

import { useCheckoutItems } from "@/shared/store/checkoutItemsStore";
import type { CheckoutLine } from "@/features/checkout/items/types";

// The basket's line arithmetic, pinned - one store, direction as data,
// replacing the two direction-named stores this lane retired. Every value
// column is the API's NewCheckoutItem; nothing here computes a price or a
// premium - that died with the client-held rate bands (ruling 51: "premium is
// on the row"). (.tsx for the jsdom lane: the store persists through
// localStorage.)

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

beforeEach(() => {
  localStorage.clear();
  useCheckoutItems.setState({ sale: [], purchase: [] });
});

describe("line arithmetic", () => {
  test("adding the same product twice is one line with quantity two", () => {
    useCheckoutItems.getState().addItem("sale", coin("p-1"));
    useCheckoutItems.getState().addItem("sale", coin("p-1"));

    const items = useCheckoutItems.getState().sale;
    expect(items).toHaveLength(1);
    expect(items[0].quantity).toBe(2);
  });

  test("two identical declared lots are one line with quantity two", () => {
    useCheckoutItems.getState().addItem("purchase", lot());
    useCheckoutItems.getState().addItem("purchase", lot());

    const items = useCheckoutItems.getState().purchase;
    expect(items).toHaveLength(1);
    expect(items[0].quantity).toBe(2);
  });

  test("declared lots with different weights are separate lines", () => {
    useCheckoutItems.getState().addItem("purchase", lot({ id: "a", pre_melt: 10 }));
    useCheckoutItems.getState().addItem("purchase", lot({ id: "b", pre_melt: 20 }));

    expect(useCheckoutItems.getState().purchase).toHaveLength(2);
  });

  test("removeOne decrements, then drops the line at one", () => {
    useCheckoutItems.getState().addItem("sale", coin("p-1"));
    useCheckoutItems.getState().addItem("sale", coin("p-1"));

    useCheckoutItems.getState().removeOne("sale", coin("p-1"));
    expect(useCheckoutItems.getState().sale[0].quantity).toBe(1);

    useCheckoutItems.getState().removeOne("sale", coin("p-1"));
    expect(useCheckoutItems.getState().sale).toHaveLength(0);
  });

  test("removeAll drops the whole line regardless of quantity", () => {
    useCheckoutItems.getState().addItem("purchase", coin("p-1", 3));
    useCheckoutItems.getState().removeAll("purchase", coin("p-1"));
    expect(useCheckoutItems.getState().purchase).toHaveLength(0);
  });

  test("setItems collapses duplicate lines into summed quantities", () => {
    useCheckoutItems.getState().setItems("sale", [coin("p-1", 2), coin("p-1", 3), coin("p-2")]);

    const items = useCheckoutItems.getState().sale;
    expect(items).toHaveLength(2);
    expect(items.find((i) => i.bullion_id === "p-1")?.quantity).toBe(5);
    expect(items.find((i) => i.bullion_id === "p-2")?.quantity).toBe(1);
  });

  test("the two directions are independent baskets", () => {
    useCheckoutItems.getState().addItem("sale", coin("p-1"));
    useCheckoutItems.getState().addItem("purchase", coin("p-1"));

    useCheckoutItems.getState().clear("sale");
    expect(useCheckoutItems.getState().sale).toHaveLength(0);
    expect(useCheckoutItems.getState().purchase).toHaveLength(1);
  });
});

describe("merging the server's basket on sign-in", () => {
  test("server lines win by identity; local-only lines survive", () => {
    useCheckoutItems.getState().setItems("purchase", [coin("shared", 5), coin("local-only", 2)]);

    useCheckoutItems.getState().merge("purchase", [coin("shared", 1), coin("server-only", 4)]);

    const items = useCheckoutItems.getState().purchase;
    expect(items.find((i) => i.bullion_id === "shared")?.quantity).toBe(1);
    expect(items.find((i) => i.bullion_id === "local-only")?.quantity).toBe(2);
    expect(items.find((i) => i.bullion_id === "server-only")?.quantity).toBe(4);
    expect(items).toHaveLength(3);
  });
});
