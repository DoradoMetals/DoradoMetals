// What a purchase order is worth - the money the business PAYS a customer for
// the metal they sent in. Eight functions compute it and none had a test.
//
// They do not agree with each other. Three separate fallbacks decide what a
// line is worth when its price is not set, and the answers differ depending on
// which function you ask. None of it fires in production today - of 89 items,
// 7 have no price and NOT ONE has neither price nor premium - so these tests
// state the behaviour as it stands rather than assert what it should be.
// Changing any of them should be a decision, not a surprise.
import { describe, expect, test } from "vitest";
import getPurchaseOrderScrapPrice from "@/features/orders/purchaseOrders/utils/getPurchaseOrderScrapPrice";
import getPurchaseOrderItemPrice from "@/features/orders/purchaseOrders/utils/getPurchaseOrderItemPrice";
import getPurchaseOrderBullionPrice from "@/features/orders/purchaseOrders/utils/getPurchaseOrderBullionPrice";
import getPurchaseOrderScrapTotal from "@/features/orders/purchaseOrders/utils/purchaseOrderScrapTotal";
import getPurchaseOrderBullionTotal from "@/features/orders/purchaseOrders/utils/purchaseOrderBullionTotal";
import getPurchaseOrderTotal from "@/features/orders/purchaseOrders/utils/purchaseOrderTotal";
import type { SpotPrice } from "@/features/spots/types";
import type { PurchaseOrder, PurchaseOrderItem } from "@/features/orders/purchaseOrders/types";
import type { Product } from "@/features/products/types";

const gold = (bid: number) => ({ name: "Gold", bid }) as SpotPrice;

const scrapItem = (over: Partial<PurchaseOrderItem> & { bid_premium?: number } = {}) => {
  const { bid_premium, ...rest } = over;
  return {
    item_type: "scrap",
    quantity: 1,
    scrap: { metal: "Gold", content: 1, bid_premium },
    ...rest,
  } as unknown as PurchaseOrderItem;
};

const bullionItem = (over: Partial<PurchaseOrderItem> & { bid_premium?: number } = {}) => {
  const { bid_premium, ...rest } = over;
  return {
    item_type: "product",
    quantity: 1,
    product: { metal_type: "Gold", content: 1, bid_premium },
    ...rest,
  } as unknown as PurchaseOrderItem;
};

describe("a line that already has a price", () => {
  // An agreed price wins over every calculation. This is the path that runs in
  // production: an admin sets the price, and no spot lookup can move it.
  test("an explicit price is returned untouched, whatever spot says", () => {
    const item = scrapItem({ price: 1234.56, premium: 0.5 });
    expect(getPurchaseOrderScrapPrice(item, [gold(3000)], [])).toBe(1234.56);
    expect(getPurchaseOrderScrapTotal([item], [gold(3000)], [])).toBe(1234.56);
  });

  test("a zero price is a price, not a missing one", () => {
    // `??` and not `||`, so a legitimately zero line stays zero rather than
    // silently falling through to the spot calculation.
    const item = scrapItem({ price: 0, premium: 0.9 });
    expect(getPurchaseOrderScrapPrice(item, [gold(3000)], [])).toBe(0);
  });
});

describe("which spot price wins", () => {
  // An order carries the spot it was priced at. That must beat the live one,
  // or a customer's agreed value would drift with the market after the fact.
  test("the order's own spot beats the global spot", () => {
    const item = scrapItem({ premium: 1 });
    expect(getPurchaseOrderScrapPrice(item, [gold(3000)], [gold(2000)])).toBeCloseTo(2000, 10);
  });

  test("the global spot is used when the order carries none", () => {
    const item = scrapItem({ premium: 1 });
    expect(getPurchaseOrderScrapPrice(item, [gold(3000)], [])).toBeCloseTo(3000, 10);
  });
});

describe("the premium fallbacks do not agree", () => {
  // A scrap line with no premium of its own. getPurchaseOrderScrapPrice
  // consults the scrap record's bid_premium; the two functions that TOTAL the
  // same items do not - they go straight to 1. So a scrap row carrying its own
  // premium is displayed at one number and summed at another.
  const item = scrapItem({ bid_premium: 0.9 });

  test("the per-line price uses the scrap record's bid_premium", () => {
    expect(getPurchaseOrderScrapPrice(item, [gold(3000)], [])).toBeCloseTo(2700, 10);
  });

  test("the totals ignore it and charge full spot - the documented divergence", () => {
    expect(getPurchaseOrderScrapTotal([item], [gold(3000)], [])).toBeCloseTo(3000, 10);
    const order = {
      order_items: [item],
      shipment: { shipping_charge: 0 },
      payout: { cost: 0 },
    } as unknown as PurchaseOrder;
    expect(getPurchaseOrderTotal(order, [gold(3000)], [])).toBeCloseTo(3000, 10);
  });

  test("so the sum of the displayed lines is NOT the displayed total", () => {
    const line = getPurchaseOrderScrapPrice(item, [gold(3000)], []);
    const total = getPurchaseOrderScrapTotal([item], [gold(3000)], []);
    expect(total).not.toBeCloseTo(line, 10);
    expect(total - line).toBeCloseTo(300, 10);
  });

  // Bullion resolves the missing premium to 0 rather than 1, which prices the
  // line at nothing instead of at spot. The opposite default to scrap.
  test("a bullion line with no premium anywhere is worth zero, not spot", () => {
    const bare = bullionItem();
    expect(getPurchaseOrderBullionTotal([bare], [gold(3000)], [])).toBe(0);
    expect(
      getPurchaseOrderBullionPrice(
        { metal_type: "Gold", content: 1 } as unknown as Product,
        [gold(3000)],
        [],
        null,
      ),
    ).toBe(0);
  });

  test("but getPurchaseOrderItemPrice prices that same line at full spot", () => {
    expect(getPurchaseOrderItemPrice(bullionItem(), [gold(3000)])).toBeCloseTo(3000, 10);
  });
});

describe("when no spot price matches the metal", () => {
  // Every function but one absorbs this into a zero. That is the failure mode
  // D32 is about: flip SPOTS_WIRE and `type` becomes `name`, every lookup
  // misses, and the money silently becomes nothing.
  test("the totals report zero rather than failing", () => {
    const item = scrapItem({ premium: 1 });
    expect(getPurchaseOrderScrapTotal([item], [], [])).toBe(0);
    expect(getPurchaseOrderBullionTotal([bullionItem({ premium: 1 })], [], [])).toBe(0);
  });

  test("getPurchaseOrderItemPrice throws instead - it asserts the spot is there", () => {
    // A non-null assertion rather than a `?? 0`. The only one of the six that
    // makes a missing spot visible, and it does it by crashing the render.
    expect(() => getPurchaseOrderItemPrice(scrapItem({ premium: 1 }), [])).toThrow();
  });
});

describe("totals across several lines", () => {
  test("bullion multiplies by quantity, scrap does not", () => {
    // A scrap lot is weighed, so its content already is the whole line. A
    // bullion line is n coins, so it multiplies. Easy to misread as a bug.
    const scrap = scrapItem({ premium: 1, quantity: 5 });
    expect(getPurchaseOrderScrapTotal([scrap], [gold(3000)], [])).toBeCloseTo(3000, 10);

    const bullion = bullionItem({ premium: 1, quantity: 5 });
    expect(getPurchaseOrderBullionTotal([bullion], [gold(3000)], [])).toBeCloseTo(15000, 10);
  });

  test("an empty order is worth nothing", () => {
    expect(getPurchaseOrderScrapTotal([], [gold(3000)], [])).toBe(0);
    expect(getPurchaseOrderBullionTotal([], [gold(3000)], [])).toBe(0);
  });
});

describe("what the customer is actually paid", () => {
  // The headline number: the metal, less what shipping and the payout cost.
  test("shipping and the payout cost are subtracted from the metal", () => {
    const order = {
      order_items: [scrapItem({ price: 1000 }), bullionItem({ price: 500, quantity: 2 })],
      shipment: { shipping_charge: 25 },
      payout: { cost: 10 },
    } as unknown as PurchaseOrder;
    // 1000 + (500 * 2) - 25 - 10
    expect(getPurchaseOrderTotal(order, [gold(3000)], [])).toBeCloseTo(1965, 10);
  });

  test("an order with no shipment is not charged for shipping", () => {
    const order = {
      order_items: [scrapItem({ price: 1000 })],
      payout: { cost: 0 },
    } as unknown as PurchaseOrder;
    expect(getPurchaseOrderTotal(order, [gold(3000)], [])).toBeCloseTo(1000, 10);
  });

  test("a payout cost is a deduction, so it can exceed the metal and go negative", () => {
    const order = {
      order_items: [scrapItem({ price: 5 })],
      shipment: { shipping_charge: 25 },
      payout: { cost: 10 },
    } as unknown as PurchaseOrder;
    expect(getPurchaseOrderTotal(order, [gold(3000)], [])).toBeCloseTo(-30, 10);
  });
});
