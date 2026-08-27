// How one order is divided three ways: what the customer is paid, what the
// refiner takes, and what the business keeps. 304 lines and no test until now.
//
// The shape to hold in mind: the two premiums are POSITIONS ON A LINE, not
// slices. The dorado premium is the fraction of spot the customer gets; the
// refiner premium is the fraction the refiner passes back. The business keeps
// the gap between them, and the refiner keeps whatever is above.
import { describe, expect, test } from "vitest";
import {
  computePurchaseOrderTotals,
  getSpotNet,
  getTotalProfit,
} from "@/features/orders/purchaseOrders/utils/calculatePurchaseOrderTotals";
import type { SpotPrice } from "@/features/spots/types";
import type {
  ProfitMetalsDict,
  PurchaseOrder,
  PurchaseOrderItem,
} from "@/features/orders/purchaseOrders/types";

const spot = (type: string, bid: number) => ({ name: type, bid }) as SpotPrice;

const scrap = (over: Record<string, unknown> = {}) =>
  ({
    item_type: "scrap",
    quantity: 1,
    scrap: { metal: "Gold", content: 1, ...(over.scrap as object) },
    ...over,
  }) as unknown as PurchaseOrderItem;

const bullion = (over: Record<string, unknown> = {}) =>
  ({
    item_type: "product",
    quantity: 1,
    product: { metal_type: "Gold", content: 1, ...(over.product as object) },
    ...over,
  }) as unknown as PurchaseOrderItem;

const order = (items: PurchaseOrderItem[], over: Record<string, unknown> = {}) =>
  ({
    order_items: items,
    shipment: { shipping_charge: 0 },
    shipping_fee_actual: 0,
    refiner_fee: 0,
    payout: { cost: 0 },
    ...over,
  }) as unknown as PurchaseOrder;

const dict = (over: Record<string, number> = {}): ProfitMetalsDict =>
  ({
    gold: { content: 0, percentage: 0, profit: over.gold ?? 0 },
    silver: { content: 0, percentage: 0, profit: over.silver ?? 0 },
    platinum: { content: 0, percentage: 0, profit: over.platinum ?? 0 },
    palladium: { content: 0, percentage: 0, profit: over.palladium ?? 0 },
  }) as unknown as ProfitMetalsDict;

describe("getTotalProfit", () => {
  test("adds the four metals, then adds spot net and subtracts the two fees", () => {
    const m = dict({ gold: 100, silver: 20, platinum: 5, palladium: 1 });
    expect(getTotalProfit(m, 0)).toBeCloseTo(126, 10);
    expect(getTotalProfit(m, 10, 4, 6)).toBeCloseTo(114, 10);
  });

  test("spot net and the refiner fee default to nothing", () => {
    expect(getTotalProfit(dict({ gold: 50 }), 10)).toBeCloseTo(40, 10);
  });

  test("it can be negative - the fees are not floored at the metal", () => {
    expect(getTotalProfit(dict({ gold: 5 }), 100)).toBeCloseTo(-95, 10);
  });
});

describe("getSpotNet", () => {
  // The business is paid at the refiner's spot and pays the customer at the
  // order's. The difference on the customer's metal is the business's, and it
  // is credited to nobody else.
  test("is the customer's content times the gap between the two spots", () => {
    const custs = dict();
    custs.gold.content = 2;
    const net = getSpotNet(custs, [spot("Gold", 1000)], [spot("Gold", 1050)]);
    expect(net.dorado).toBeCloseTo(100, 10);
    expect(net.customer).toBe(0);
    expect(net.refiner).toBe(0);
  });

  test("goes negative when the refiner's spot is the lower one", () => {
    const custs = dict();
    custs.gold.content = 2;
    expect(getSpotNet(custs, [spot("Gold", 1050)], [spot("Gold", 1000)]).dorado).toBeCloseTo(-100, 10);
  });

  // A missing spot is skipped rather than treated as zero, which would have
  // charged the whole spot as a loss. Worth knowing it is a skip.
  test("a metal is skipped entirely when either spot is missing", () => {
    const custs = dict();
    custs.gold.content = 2;
    expect(getSpotNet(custs, [spot("Gold", 1000)], []).dorado).toBe(0);
    expect(getSpotNet(custs, [], [spot("Gold", 1050)]).dorado).toBe(0);
  });

  test("a metal with no content contributes nothing", () => {
    expect(getSpotNet(dict(), [spot("Gold", 1000)], [spot("Gold", 1050)]).dorado).toBe(0);
  });
});

const spots = [spot("Gold", 1000)];
const refSpots = [spot("Gold", 1100)];

describe("splitting one scrap line three ways", () => {
  // dorado premium .9 => the customer gets 90% of the metal.
  // refiner premium .95 => the refiner returns 95%, keeping 5%.
  // The business keeps the 5% in between.
  const o = order([scrap({ premium: 0.9, refiner_premium: 0.95 })]);
  const t = computePurchaseOrderTotals(o, spots, refSpots);

  test("the customer takes the dorado premium of the content", () => {
    expect(t.customer.total.gold.content).toBeCloseTo(0.9, 10);
  });

  test("the refiner keeps what its own premium does not return", () => {
    expect(t.refiner.total.gold.content).toBeCloseTo(0.05, 10);
  });

  test("the business keeps the gap between the two premiums", () => {
    expect(t.dorado.total.gold.content).toBeCloseTo(0.05, 10);
  });

  test("the three shares account for the whole lot", () => {
    const sum =
      t.customer.total.gold.content + t.dorado.total.gold.content + t.refiner.total.gold.content;
    expect(sum).toBeCloseTo(1, 10);
    expect(
      t.customer.total.gold.percentage + t.dorado.total.gold.percentage + t.refiner.total.gold.percentage
    ).toBeCloseTo(100, 8);
  });

  // This is the part worth stating out loud: the customer is valued at the
  // spot the order was priced at, and the other two at the refiner's.
  test("the customer is valued at the order's spot, the other two at the refiner's", () => {
    expect(t.customer.total.gold.profit).toBeCloseTo(0.9 * 1000, 10);
    expect(t.dorado.total.gold.profit).toBeCloseTo(0.05 * 1100, 10);
    expect(t.refiner.total.gold.profit).toBeCloseTo(0.05 * 1100, 10);
  });
});

describe("when only one premium is given", () => {
  test("the missing one mirrors it, so nothing is left in the middle", () => {
    const t = computePurchaseOrderTotals(order([scrap({ premium: 0.9 })]), spots, refSpots);
    expect(t.customer.total.gold.content).toBeCloseTo(0.9, 10);
    expect(t.dorado.total.gold.content).toBeCloseTo(0, 10);
    expect(t.refiner.total.gold.content).toBeCloseTo(0.1, 10);
  });

  test("a refiner premium alone is mirrored the same way", () => {
    const t = computePurchaseOrderTotals(order([scrap({ refiner_premium: 0.8 })]), spots, refSpots);
    expect(t.customer.total.gold.content).toBeCloseTo(0.8, 10);
    expect(t.dorado.total.gold.content).toBeCloseTo(0, 10);
    expect(t.refiner.total.gold.content).toBeCloseTo(0.2, 10);
  });
});

describe("when neither premium is given and there are no rate bands", () => {
  test("a bullion line gives the whole lot to the customer", () => {
    const t = computePurchaseOrderTotals(order([bullion()]), spots, refSpots);
    expect(t.customer.total.gold.content).toBeCloseTo(1, 10);
    expect(t.dorado.total.gold.content).toBeCloseTo(0, 10);
    expect(t.refiner.total.gold.content).toBeCloseTo(0, 10);
  });

  test("a scrap line does too, by a different route through the same function", () => {
    const t = computePurchaseOrderTotals(order([scrap()]), spots, refSpots, []);
    expect(t.customer.total.gold.content).toBeCloseTo(1, 10);
    expect(t.dorado.total.gold.content).toBeCloseTo(0, 10);
  });
});

describe("when the business premium is above the refiner's", () => {
  // The customer is promised more than the refiner returns. The shares no
  // longer sum to one, so the remainder is rescaled - and it comes out of the
  // refiner, not the customer.
  test("the customer still gets what was promised and the refiner absorbs it", () => {
    const t = computePurchaseOrderTotals(
      order([scrap({ premium: 0.9, refiner_premium: 0.8 })]),
      spots,
      refSpots
    );
    expect(t.customer.total.gold.content).toBeCloseTo(0.9, 10);
    expect(t.dorado.total.gold.content).toBeCloseTo(0, 10);
    expect(t.refiner.total.gold.content).toBeCloseTo(0.1, 10);
  });

  test("a premium above 1 is clamped rather than paying more than the metal", () => {
    const t = computePurchaseOrderTotals(order([scrap({ premium: 1.5 })]), spots, refSpots);
    expect(t.customer.total.gold.content).toBeCloseTo(1, 10);
  });
});

describe("when a scrap lot assays below the estimate it was quoted on", () => {
  // The customer's share is computed on the ESTIMATE they were quoted; the
  // other two are computed on what actually came back. So a lot that assays
  // light is absorbed by the business, and its content goes NEGATIVE.
  const o = order([
    scrap({ premium: 1, refiner_premium: 1, scrap: { metal: "Gold", content: 1, content_actual: 0.8 } }),
  ]);
  const t = computePurchaseOrderTotals(o, spots, refSpots);

  test("the customer is still credited the full estimate", () => {
    expect(t.customer.total.gold.content).toBeCloseTo(1, 10);
  });

  test("the business absorbs the shortfall as negative content", () => {
    expect(t.dorado.total.gold.content).toBeCloseTo(-0.2, 10);
    expect(t.dorado.total.gold.profit).toBeCloseTo(-0.2 * 1100, 10);
  });

  test("so the percentages no longer read as shares of a whole", () => {
    // 1 / (1 - 0.2 + 0) = 125%. A number over 100 here is this case, not a bug
    // in the arithmetic.
    expect(t.customer.total.gold.percentage).toBeCloseTo(125, 6);
    expect(t.dorado.total.gold.percentage).toBeCloseTo(-25, 6);
  });

  test("post-melt times purity is used when there is no direct actual", () => {
    const o2 = order([
      scrap({
        premium: 1,
        refiner_premium: 1,
        scrap: { metal: "Gold", content: 1, post_melt_actual: 1.6, purity_actual: 0.5 },
      }),
    ]);
    expect(computePurchaseOrderTotals(o2, spots, refSpots).dorado.total.gold.content).toBeCloseTo(-0.2, 10);
  });
});

describe("scrap and bullion are also reported apart", () => {
  const o = order([scrap({ premium: 0.9, refiner_premium: 0.95 }), bullion({ premium: 0.8, refiner_premium: 0.9 })]);
  const t = computePurchaseOrderTotals(o, spots, refSpots);

  test("the scrap bucket holds only the scrap line", () => {
    expect(t.customer.scrap.gold.content).toBeCloseTo(0.9, 10);
    expect(t.customer.bullion.gold.content).toBeCloseTo(0.8, 10);
  });

  test("the total bucket holds both", () => {
    expect(t.customer.total.gold.content).toBeCloseTo(1.7, 10);
  });

  test("a line with no metal or no content is skipped rather than counted as zero", () => {
    const t2 = computePurchaseOrderTotals(
      order([scrap({ premium: 1, scrap: { metal: null, content: 5 } }), scrap({ premium: 1, scrap: { metal: "Gold", content: 0 } })]),
      spots,
      refSpots
    );
    expect(t2.customer.total.gold.content).toBe(0);
  });
});

describe("shipping and fees land on the right party", () => {
  test("the business nets what it charged for shipping against what it paid", () => {
    const t = computePurchaseOrderTotals(
      order([scrap({ premium: 1, refiner_premium: 1 })], {
        shipment: { shipping_charge: 30 },
        shipping_fee_actual: 12,
      }),
      spots,
      refSpots
    );
    expect(t.dorado.shipping_net).toBeCloseTo(18, 10);
    expect(t.customer.shipping_net).toBeCloseTo(-18, 10);
    expect(t.refiner.shipping_net).toBe(0);
  });

  test("the payout cost is shown against the customer and the refiner fee against the business", () => {
    const t = computePurchaseOrderTotals(
      order([scrap({ premium: 1, refiner_premium: 1 })], { refiner_fee: 40, payout: { cost: 7 } }),
      spots,
      refSpots
    );
    expect(t.dorado.refiner_fee_net).toBeCloseTo(-40, 10);
    expect(t.customer.refiner_fee_net).toBeCloseTo(-7, 10);
    expect(t.refiner.refiner_fee_net).toBe(0);
  });

  test("an empty order is all zeroes rather than a crash", () => {
    const t = computePurchaseOrderTotals(order([]), spots, refSpots);
    expect(t.customer.total.gold.content).toBe(0);
    expect(t.dorado.total_profit).toBe(0);
  });
});
