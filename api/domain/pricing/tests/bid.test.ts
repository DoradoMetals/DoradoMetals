import { test } from "vitest";
import assert from "node:assert/strict";
import {
  bullionLines,
  calculateReturnDeclaredValue,
  calculateTotalPrice,
  effectivePayoutFee,
  itemsTotal,
  scrapLines,
  unitPrice,
  type Bids,
} from "#domain/pricing/service.ts";
import { Invalid } from "#shared/errors.ts";
import type { OrderView, OrderViewItem } from "@dorado/contracts";

const GOLD = "11111111-1111-4111-8111-111111111111";
const SILVER = "22222222-2222-4222-8222-222222222222";
const PLATINUM = "33333333-3333-4333-8333-333333333333";

const bids: Bids = new Map([
  [GOLD, 4000],
  [SILVER, 30],
]);

const scrapItem = (over: Partial<OrderViewItem> = {}): OrderViewItem =>
  Object.assign(
    {
      id: "line-scrap",
      order_id: "order-1",
      bullion_id: null,
      metal_id: GOLD,
      premium: 0.9,
      content: 2,
      quantity: 1,
      product: null,
    } as unknown as OrderViewItem,
    over
  );

const productItem = (over: Partial<OrderViewItem> = {}): OrderViewItem =>
  Object.assign(
    {
      id: "line-bullion",
      order_id: "order-1",
      bullion_id: "prod-1",
      metal_id: SILVER,
      quantity: 1,
      premium: 0.8,
      content: 1,
      product: null,
    } as unknown as OrderViewItem,
    over
  );

const order = (over: Record<string, unknown> = {}): OrderView =>
  Object.assign(
    {
      order: { id: "order-1", number: 1 },
      totals: null,
      items: [],
      address: null,
      shipments: [{ direction: "Inbound", cost: 0 }],
      pickup: null,
      payout: { cost: 0 },
      user: null,
    } as unknown as OrderView,
    over
  );

test("scrap is content x spot x premium", () => {
  assert.equal(unitPrice(scrapItem(), bids), 7200);
});

test("product is content x spot x premium, then multiplied by quantity", () => {
  const item = productItem({ quantity: 3 });
  assert.equal(unitPrice(item, bids), 24);
  assert.equal(calculateTotalPrice(order({ items: [item] }), bids), 72);
});

test("a bullion line with no content refuses rather than pricing at zero", () => {
  assert.throws(() => unitPrice(productItem({ content: null }), bids), Invalid);
});

test("a scrap line with no content still prices at zero, not a refusal", () => {
  assert.equal(unitPrice(scrapItem({ content: null }), bids), 0);
});

test("a stored price wins over recomputing from spot", () => {
  assert.equal(unitPrice(scrapItem({ price: 123 }), bids), 123);
  assert.equal(unitPrice(productItem({ price: 5 }), bids), 5);
});

test("a stored price of zero is kept, not recomputed", () => {
  assert.equal(unitPrice(scrapItem({ price: 0 }), bids), 0);
});

test("the order total subtracts shipping and the payout fee", () => {
  const o = order({
    items: [scrapItem()],
    shipments: [{ direction: "Inbound", cost: 200 }],
    payout: { cost: 50 },
  });
  assert.equal(calculateTotalPrice(o, bids), 7200 - 200 - 50);
});

test("a missing shipment is treated as no shipping charge", () => {
  const o = order({ items: [scrapItem()], shipments: [] });
  assert.equal(calculateTotalPrice(o, bids), 7200);
});

test("a return leg's cost is not deducted from the customer's payout", () => {
  const o = order({
    items: [scrapItem()],
    shipments: [
      { direction: "Inbound", cost: 200 },
      { direction: "Return", cost: 999 },
    ],
    payout: { cost: 0 },
  });
  assert.equal(calculateTotalPrice(o, bids), 7200 - 200);
});

test("the return declared value ignores stored prices and both fees", () => {
  const o = order({
    items: [scrapItem({ price: 1 })],
    shipments: [{ direction: "Inbound", cost: 200 }],
    payout: { cost: 50 },
  });
  assert.equal(calculateReturnDeclaredValue(o, bids), 1);
  assert.equal(
    calculateReturnDeclaredValue(order({ items: [scrapItem()] }), bids),
    7200
  );
});

test("bullion and scrap subtotals split the order", () => {
  const items = [scrapItem(), productItem({ quantity: 2 })];
  assert.equal(itemsTotal(scrapLines(items), bids), 7200);
  assert.equal(itemsTotal(bullionLines(items), bids), 48);
});

test("a payout object with no cost is the fee-less case, not NaN", () => {
  const o = order({ items: [scrapItem()], payout: {} });
  const total = calculateTotalPrice(o, bids);
  assert.ok(!Number.isNaN(total), "the whole invoice became NaN");
  assert.equal(total, 7200);
});

test("a null payout cost is no payout fee", () => {
  const o = order({ items: [scrapItem()], payout: { cost: null } });
  assert.equal(calculateTotalPrice(o, bids), 7200);
});

test("a missing payout is no payout fee, and does not throw", () => {
  assert.equal(calculateTotalPrice(order({ items: [scrapItem()], payout: null }), bids), 7200);
  assert.equal(
    calculateTotalPrice(order({ items: [scrapItem()], payout: undefined }), bids),
    7200
  );
});

test("a payout cost that is not a number throws rather than defaulting", () => {
  const o = order({ items: [scrapItem()], payout: { cost: "not a fee" } });
  assert.throws(() => calculateTotalPrice(o, bids), TypeError);
});

test("a shipping charge that is not a number throws rather than defaulting", () => {
  const o = order({ items: [scrapItem()], shipments: [{ direction: "Inbound", cost: "free" }] });
  assert.throws(() => calculateTotalPrice(o, bids), TypeError);
});

test("a numeric string is still a fee", () => {
  const o = order({ items: [scrapItem()], payout: { cost: "50" } });
  assert.equal(calculateTotalPrice(o, bids), 7200 - 50);
});

test("a line total that cannot be computed stops the invoice", () => {
  const o = order({ items: [scrapItem({ price: Number.NaN })] });
  assert.throws(() => calculateTotalPrice(o, bids), TypeError);
});

test("a return declared value that cannot be computed stops the label", () => {
  const o = order({ items: [scrapItem({ content: Number.NaN })] });
  assert.throws(() => calculateReturnDeclaredValue(o, bids), TypeError);
});

test("a metal absent from the quote feed throws", () => {
  const o = order({ items: [scrapItem({ metal_id: PLATINUM })] });
  assert.throws(() => calculateTotalPrice(o, bids), TypeError);
});

test("a metal quoted at null prices at zero rather than throwing", () => {
  const unquoted: Bids = new Map([[GOLD, null]]);
  assert.equal(unitPrice(scrapItem(), unquoted), 0);
});

test("a scrap line with no premium is worth zero, loudly", () => {
  const item = scrapItem({ premium: null, content: 1 });
  assert.equal(unitPrice(item, bids), 0);
  assert.equal(calculateTotalPrice(order({ items: [item] }), bids), 0);
});

test("a bullion line does NOT fall back to its product's own bid_premium", () => {
  const item = productItem({ premium: null, product: { content: 1, bid_premium: 0.8 } as never });
  assert.equal(unitPrice(item, bids), 0);
  assert.equal(itemsTotal(bullionLines([item]), bids), 0);
  assert.equal(calculateTotalPrice(order({ items: [item] }), bids), 0);
  assert.equal(calculateReturnDeclaredValue(order({ items: [item] }), bids), 0);
});

test("an explicit premium prices the line", () => {
  assert.equal(unitPrice(scrapItem({ premium: 0.9, content: 1 }), bids), 3600);
});

test("a waived payout fee is not deducted, and the stored fee still says what it was", () => {
  const o = order({
    items: [scrapItem()],
    payout: { cost: 20 },
    totals: { waive_payout_fee: true },
  });
  assert.equal(calculateTotalPrice(o, bids), 7200, "the waived fee was still deducted");
  assert.equal(o.payout?.cost, 20, "waiving overwrote the stored fee");
  assert.equal(effectivePayoutFee(o), 0);
});

test("an unwaived fee is deducted, whatever the flag's other spellings", () => {
  const priced = (waive: unknown) =>
    calculateTotalPrice(
      order({
        items: [scrapItem()],
        payout: { cost: 20 },
        totals: { waive_payout_fee: waive },
      }),
      bids
    );
  assert.equal(priced(false), 7180);
  assert.equal(priced(null), 7180);
  assert.equal(priced(undefined), 7180);
});

const anOrder = (over: Partial<OrderView> = {}): OrderView =>
  ({ payout: null, totals: null, ...over }) as OrderView;

test("effectivePayoutFee is the stored fee unless the order waives it", () => {
  const paid = { cost: 125 } as OrderView["payout"];
  const waived = { waive_payout_fee: true } as OrderView["totals"];
  assert.equal(effectivePayoutFee(anOrder({ payout: paid })), 125);
  assert.equal(effectivePayoutFee(anOrder({ payout: paid, totals: waived })), 0);
  assert.equal(effectivePayoutFee(anOrder({ payout: null, totals: waived })), 0);
  assert.equal(effectivePayoutFee(anOrder()), 0);
});
