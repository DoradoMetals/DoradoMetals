// Naming the scrap lines on a purchase order.
//
// The API never sends a scrap line a name - it has no such column, and the
// response carries `metal` instead. The admin table's first column comes from
// this function, which derives "Gold Item 1", "Gold Item 2" and so on
// client-side. That is worth knowing before anyone goes looking for a `name`
// in the wire shape and concludes it went missing in the migration.
//
// It also mutates and filters, so what it drops matters as much as what it
// names: a line whose metal never arrived is silently removed from the table.
import { describe, expect, test } from "vitest";
import { assignScrapItemNames } from "@/features/orders/purchaseOrders/types";
import type { PurchaseOrderItem } from "@/features/orders/purchaseOrders/types";

const item = (metal: string | null, id = metal ?? "none") =>
  ({ id, scrap: metal ? { metal } : undefined }) as unknown as PurchaseOrderItem;

describe("assignScrapItemNames", () => {
  test("numbers each metal's lines from one, independently", () => {
    const named = assignScrapItemNames([
      item("Gold", "g1"), item("Silver", "s1"), item("Gold", "g2"),
    ]);
    const byId = Object.fromEntries(named.map((i) => [i.id, i.scrap?.name]));
    expect(byId.g1).toBe("Gold Item 1");
    expect(byId.g2).toBe("Gold Item 2");
    expect(byId.s1).toBe("Silver Item 1");
  });

  test("orders by metal, not by arrival", () => {
    const named = assignScrapItemNames([
      item("Palladium"), item("Gold"), item("Platinum"), item("Silver"),
    ]);
    expect(named.map((i) => i.scrap?.metal)).toEqual([
      "Gold", "Silver", "Platinum", "Palladium",
    ]);
  });

  // The one that would cost someone an afternoon. A line with no metal is
  // dropped entirely rather than rendered without a name, so an item that
  // failed to resolve its metal disappears from the admin table instead of
  // showing up blank - and the row count no longer matches the order.
  test("drops a line whose metal is missing, rather than naming it", () => {
    const named = assignScrapItemNames([item("Gold"), item(null, "orphan")]);
    expect(named).toHaveLength(1);
    expect(named.map((i) => i.id)).not.toContain("orphan");
  });

  // A metal outside the known four sorts to the front, because indexOf returns
  // -1. Nothing produces one today, but it is the behaviour, not a decision.
  test("an unknown metal sorts ahead of the known ones", () => {
    const named = assignScrapItemNames([item("Gold"), item("Rhodium")]);
    expect(named[0].scrap?.metal).toBe("Rhodium");
  });

  test("leaves the original items untouched", () => {
    const input = [item("Gold")];
    assignScrapItemNames(input);
    expect(input[0].scrap).not.toHaveProperty("name");
  });

  test("an empty order names nothing and throws nothing", () => {
    expect(assignScrapItemNames([])).toEqual([]);
  });
});
