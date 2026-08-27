// The five functions that price a purchase order, and the three rules they use
// for the same premium.
//
// A purchase order is what the business PAYS a customer for metal they sent in.
// Each line is priced by one function and the order footer by another, so the
// two agreeing is not a nicety - it is the difference between the screen adding
// up and not. These tests state what each function actually does today, and two
// of them pin a disagreement rather than a desired behaviour. Those are marked.
import { describe, expect, test } from "vitest";
import getPurchaseOrderItemPrice from "@/features/orders/purchaseOrders/utils/getPurchaseOrderItemPrice";
import getPurchaseOrderScrapPrice from "@/features/orders/purchaseOrders/utils/getPurchaseOrderScrapPrice";
import getPurchaseOrderBullionPrice from "@/features/orders/purchaseOrders/utils/getPurchaseOrderBullionPrice";
import getPurchaseOrderScrapTotal from "@/features/orders/purchaseOrders/utils/purchaseOrderScrapTotal";
import getPurchaseOrderBullionTotal from "@/features/orders/purchaseOrders/utils/purchaseOrderBullionTotal";
import type { PurchaseOrderItem } from "@/features/orders/purchaseOrders/types";
import type { Product } from "@/features/products/types";
import type { SpotPrice } from "@/features/spots/types";

// Bid and ask differ so a function reaching for the wrong side is visible, and
// the order spot differs from the global one so the precedence is testable.
const globalSpots = [{ name: "Gold", bid: 3000, ask: 3050 }] as SpotPrice[];
const orderSpots = [{ name: "Gold", bid: 2900, ask: 2950 }] as SpotPrice[];

const scrapItem = (over: Partial<PurchaseOrderItem> = {}) =>
  ({
    item_type: "scrap",
    scrap: { metal: "Gold", content: 2, bid_premium: 0.9 },
    ...over,
  }) as PurchaseOrderItem;

describe("a scrap line carries its own bid premium", () => {
  test("the per-line price applies scrap.bid_premium when the item has no premium", () => {
    expect(getPurchaseOrderScrapPrice(scrapItem(), globalSpots, [])).toBeCloseTo(
      2 * 3000 * 0.9,
      10
    );
  });

  test("an explicit item premium wins over the scrap's own", () => {
    expect(
      getPurchaseOrderScrapPrice(scrapItem({ premium: 0.5 }), globalSpots, [])
    ).toBeCloseTo(2 * 3000 * 0.5, 10);
  });

  test("an order spot beats the global spot", () => {
    expect(
      getPurchaseOrderScrapPrice(scrapItem(), globalSpots, orderSpots)
    ).toBeCloseTo(2 * 2900 * 0.9, 10);
  });

  test("a price already agreed on the line is used verbatim", () => {
    expect(
      getPurchaseOrderScrapPrice(scrapItem({ price: 1234.5 }), globalSpots, orderSpots)
    ).toBeCloseTo(1234.5, 10);
  });

  test("an unknown metal prices at zero rather than throwing", () => {
    const silver = scrapItem({ scrap: { metal: "Silver", content: 2, bid_premium: 0.9 } as never });
    expect(getPurchaseOrderScrapPrice(silver, globalSpots, [])).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// PINNING A DISAGREEMENT, NOT A DESIRED BEHAVIOUR.
//
// getPurchaseOrderScrapPrice reads `item.premium ?? item.scrap.bid_premium ?? 1`.
// purchaseOrderScrapTotal and purchaseOrderTotal both read `item.premium ?? 1`
// and never look at scrap.bid_premium at all.
//
// So for a scrap line with a bid_premium and NO explicit premium - which is
// exactly what a line looks like before an admin edits it - the line and the
// total are computed from different numbers. The footer does not equal the sum
// of the rows shown above it, and the gap is the premium: at 0.9 the total is
// ~11% higher than the lines it claims to add up.
//
// Recorded in FOLLOWUPS as D59. NOT "fixed" here: which of the two is correct is
// a business question about what the business intends to pay, and the same
// judgement call as D47's assay fallback.
// ---------------------------------------------------------------------------
describe("the line price and the order total disagree about scrap.bid_premium", () => {
  test("the per-line price honours it", () => {
    expect(getPurchaseOrderScrapPrice(scrapItem(), globalSpots, [])).toBeCloseTo(
      2 * 3000 * 0.9,
      10
    );
  });

  test("the total ignores it and charges full spot", () => {
    expect(getPurchaseOrderScrapTotal([scrapItem()], globalSpots, [])).toBeCloseTo(
      2 * 3000 * 1,
      10
    );
  });

  test("so a single scrap line does not sum to its own total", () => {
    const line = getPurchaseOrderScrapPrice(scrapItem(), globalSpots, []);
    const total = getPurchaseOrderScrapTotal([scrapItem()], globalSpots, []);
    expect(total).not.toBeCloseTo(line, 10);
    // The gap is exactly the premium that one of them dropped.
    expect(total * 0.9).toBeCloseTo(line, 10);
  });

  test("they agree once the line carries an explicit premium", () => {
    const withPremium = scrapItem({ premium: 0.8 });
    expect(getPurchaseOrderScrapTotal([withPremium], globalSpots, [])).toBeCloseTo(
      getPurchaseOrderScrapPrice(withPremium, globalSpots, []),
      10
    );
  });
});

describe("bullion falls back to zero where scrap falls back to one", () => {
  const bullion = { metal_type: "Gold", content: 1, bid_premium: 0.97 } as Product;

  test("a bullion premium comes from the product when the caller passes none", () => {
    expect(getPurchaseOrderBullionPrice(bullion, globalSpots, [], null)).toBeCloseTo(
      1 * 3000 * 0.97,
      10
    );
  });

  test("an explicit premium wins", () => {
    expect(getPurchaseOrderBullionPrice(bullion, globalSpots, [], 0.5)).toBeCloseTo(
      1 * 3000 * 0.5,
      10
    );
  });

  // Bullion with no premium anywhere prices at ZERO - the business pays nothing.
  // Scrap in the same position prices at FULL SPOT. Both are one-line fallbacks
  // and they point opposite ways; stated here so a change to either is visible.
  test("bullion with no premium at all prices at zero", () => {
    const bare = { metal_type: "Gold", content: 1 } as Product;
    expect(getPurchaseOrderBullionPrice(bare, globalSpots, [], null)).toBe(0);
  });

  test("scrap with no premium at all prices at full spot", () => {
    const bare = scrapItem({ scrap: { metal: "Gold", content: 2 } as never });
    expect(getPurchaseOrderScrapPrice(bare, globalSpots, [])).toBeCloseTo(2 * 3000 * 1, 10);
  });

  test("a bullion total multiplies by quantity", () => {
    const item = { item_type: "product", product: bullion, quantity: 3 } as PurchaseOrderItem;
    expect(getPurchaseOrderBullionTotal([item], globalSpots, [])).toBeCloseTo(
      3 * 1 * 3000 * 0.97,
      10
    );
  });
});

// ---------------------------------------------------------------------------
// getPurchaseOrderItemPrice resolves its spot with `spots.find(...)!` - a
// non-null assertion - and then reads `spot.bid`. Every sibling in this
// folder either guards with `?? null` or falls back to 0. This one THROWS.
//
// It is also the only one matching the metal name case-sensitively;
// calculatePurchaseOrderTotals lowercases both sides. Two functions resolving
// the same spot from the same data, disagreeing on both counts. D59.
// ---------------------------------------------------------------------------
describe("getPurchaseOrderItemPrice throws where its siblings return zero", () => {
  test("it prices a known metal like the others", () => {
    const item = scrapItem({ premium: 0.9 });
    expect(getPurchaseOrderItemPrice(item, globalSpots)).toBeCloseTo(2 * 3000 * 0.9, 10);
  });

  test("an unknown metal throws instead of pricing at zero", () => {
    const silver = scrapItem({ scrap: { metal: "Silver", content: 2, bid_premium: 0.9 } as never });
    expect(() => getPurchaseOrderItemPrice(silver, globalSpots)).toThrow();
  });

  test("a case difference in the metal name is enough to throw", () => {
    const lower = scrapItem({ scrap: { metal: "gold", content: 2, bid_premium: 0.9 } as never });
    expect(() => getPurchaseOrderItemPrice(lower, globalSpots)).toThrow();
    // The same mismatch is survivable everywhere else in the folder.
    expect(getPurchaseOrderScrapPrice(lower, globalSpots, [])).toBe(0);
  });
});
