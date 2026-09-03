// Naming the scrap lines on a purchase order.
//
// The API never sends a scrap line a name - it has no such column. It does
// not send a metal NAME either, since the order wire slimmed (wave 3): an
// orders.items row carries metal_id, and the display name is mapped
// client-side off the cached spots reference list, the same rule that killed
// mint_name. So this takes the lookup as a function and stays pure.
//
// The admin table's first column comes from here - "Gold Item 1", "Gold Item
// 2". That is worth knowing before anyone goes looking for a `name` in the
// wire shape and concludes it went missing in the migration.
//
// It also filters, so what it drops matters as much as what it names: a line
// whose metal does not resolve is silently removed from the table.
import { describe, expect, test } from "vitest";
import { assignScrapItemNames } from "@/features/orders/purchaseOrders/types";
import type { orders } from "@dorado/contracts";

// A line, and the metal its metal_id resolves to. The id doubles as the
// metal_id so the lookup below is a single map.
const item = (metal: string | null, id = metal ?? "none") =>
  ({ id, metal_id: metal ?? "unresolvable" }) as unknown as orders.items.Row;

// The reference lookup a component does against the cached spots list.
const metalNameOf = (metal_id: string) =>
  metal_id === "unresolvable" ? null : metal_id;

describe("assignScrapItemNames", () => {
  test("numbers each metal's lines from one, independently", () => {
    const named = assignScrapItemNames(
      [item("Gold", "g1"), item("Silver", "s1"), item("Gold", "g2")],
      // g1/g2 carry metal_id "Gold" because item() sets it from the metal.
      metalNameOf
    );
    const byId = Object.fromEntries(named.map((i) => [i.id, i.name]));
    expect(byId.g1).toBe("Gold Item 1");
    expect(byId.g2).toBe("Gold Item 2");
    expect(byId.s1).toBe("Silver Item 1");
  });

  test("orders by metal, not by arrival", () => {
    const named = assignScrapItemNames(
      [item("Palladium"), item("Gold"), item("Platinum"), item("Silver")],
      metalNameOf
    );
    expect(named.map((i) => i.metal)).toEqual([
      "Gold", "Silver", "Platinum", "Palladium",
    ]);
  });

  // The one that would cost someone an afternoon. A line whose metal does not
  // resolve is dropped entirely rather than rendered without a name, so an
  // item that failed to resolve disappears from the admin table instead of
  // showing up blank - and the row count no longer matches the order.
  //
  // IT IS A LOOKUP MISS NOW, NOT A MISSING FIELD, and that is a widened
  // failure mode worth stating: before the slim, `metal` was on the row, so
  // this only fired for data that was genuinely absent. Now it also fires
  // while the spots reference list is still loading, which is a render away
  // from an admin seeing an order with no lines.
  test("drops a line whose metal does not resolve, rather than naming it", () => {
    const named = assignScrapItemNames(
      [item("Gold"), item(null, "orphan")],
      metalNameOf
    );
    expect(named).toHaveLength(1);
    expect(named.map((i) => i.id)).not.toContain("orphan");
  });

  // A metal outside the known four sorts to the front, because indexOf returns
  // -1. Nothing produces one today, but it is the behaviour, not a decision.
  test("an unknown metal sorts ahead of the known ones", () => {
    const named = assignScrapItemNames([item("Gold"), item("Rhodium")], metalNameOf);
    expect(named[0].metal).toBe("Rhodium");
  });

  test("leaves the original items untouched", () => {
    const input = [item("Gold")];
    assignScrapItemNames(input, metalNameOf);
    expect(input[0]).not.toHaveProperty("name");
  });

  test("an empty order names nothing and throws nothing", () => {
    expect(assignScrapItemNames([], metalNameOf)).toEqual([]);
  });
});
