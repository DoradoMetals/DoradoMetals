import test from "node:test";
import assert from "node:assert/strict";
import {
  calculateTotalPrice,
  calculateItemPrice,
  calculateReturnDeclaredValue,
  getBullionTotal,
  getScrapTotal,
} from "#features/purchase-orders/utils/calculations.ts";

const spots = [
  { type: "Gold", bid_spot: 4000 },
  { type: "Silver", bid_spot: 30 },
];

const scrapItem = (over = {}) => ({
  item_type: "scrap",
  premium: 0.9,
  scrap: { metal: "Gold", content: 2 },
  ...over,
});

const productItem = (over = {}) => ({
  item_type: "product",
  quantity: 1,
  product: { metal_type: "Silver", content: 1, bid_premium: 0.8 },
  ...over,
});

const order = (over = {}) => ({
  order_items: [],
  shipment: { shipping_charge: 0 },
  payout: { cost: 0 },
  ...over,
});

test("scrap is content x spot x premium", () => {
  // 2 oz x 4000 x 0.9
  assert.equal(calculateItemPrice(scrapItem(), spots), 7200);
});

test("product is content x spot x premium, then multiplied by quantity", () => {
  const item = productItem({ quantity: 3 });
  // calculateItemPrice is per unit ...
  assert.equal(calculateItemPrice(item, spots), 24);
  // ... while the order total applies quantity.
  assert.equal(calculateTotalPrice(order({ order_items: [item] }), spots), 72);
});

test("a stored price wins over recomputing from spot", () => {
  assert.equal(calculateItemPrice(scrapItem({ price: 123 }), spots), 123);
  assert.equal(calculateItemPrice(productItem({ price: 5 }), spots), 5);
});

// A stored price of 0 is falsy but not nullish, and ?? keeps it. Worth pinning:
// a confirmed zero-value line must not silently reprice off live spot.
test("a stored price of zero is kept, not recomputed", () => {
  assert.equal(calculateItemPrice(scrapItem({ price: 0 }), spots), 0);
});

test("the order total subtracts shipping and the payout fee", () => {
  const o = order({
    order_items: [scrapItem()],
    shipment: { shipping_charge: 200 },
    payout: { cost: 50 },
  });
  assert.equal(calculateTotalPrice(o, spots), 7200 - 200 - 50);
});

test("a missing shipment is treated as no shipping charge", () => {
  const o = order({ order_items: [scrapItem()], shipment: undefined });
  assert.equal(calculateTotalPrice(o, spots), 7200);
});

test("items of an unknown type contribute nothing", () => {
  const o = order({ order_items: [{ item_type: "mystery" }, scrapItem()] });
  assert.equal(calculateTotalPrice(o, spots), 7200);
});

test("the return declared value ignores stored prices and both fees", () => {
  const o = order({
    order_items: [scrapItem({ price: 1 })],
    shipment: { shipping_charge: 200 },
    payout: { cost: 50 },
  });
  // Priced off spot regardless of the stored 1, and nothing is deducted.
  assert.equal(calculateReturnDeclaredValue(o, spots), 7200);
});

test("bullion and scrap subtotals split the order", () => {
  const items = [scrapItem(), productItem({ quantity: 2 })];
  assert.equal(getScrapTotal([items[0]], spots), 7200);
  assert.equal(getBullionTotal([items[1]], spots), 48);
});

// The two below document fragility rather than desired behaviour. Both throw on
// input the database can produce today: payout is a LEFT JOIN so it can be null,
// and spots comes from the caller. Tests exist so that making them defensive is
// a deliberate change with a failing assertion, not a silent one.
test("a missing payout throws rather than defaulting the fee", () => {
  const o = order({ order_items: [scrapItem()], payout: null });
  assert.throws(() => calculateTotalPrice(o, spots), TypeError);
});

test("a metal absent from spots throws", () => {
  const o = order({ order_items: [scrapItem({ scrap: { metal: "Platinum", content: 1 } })] });
  assert.throws(() => calculateTotalPrice(o, spots), TypeError);
});


// A scrap line whose premium is null.
//
// Every product branch has always fallen back to the row's own premium; no
// scrap branch did, so such a line was worth nothing. It was found by comparing
// the two PDFs a customer receives for the same order - see the note at the top
// of calculations.js. The fixture mirrors dev purchase order 239: one troy
// ounce of gold, no premium on the line, 0.75 on the scrap row.
const unpricedGold = () => ({
  item_type: "scrap",
  premium: null,
  scrap: { metal: "Gold", content: 1, bid_premium: 0.75 },
});

test("a scrap line with no premium falls back to the scrap row's own", () => {
  // 1 oz x 4000 x 0.75
  assert.equal(calculateItemPrice(unpricedGold(), spots), 3000);
});

test("an order total counts a scrap line with no premium", () => {
  const o = order({ order_items: [unpricedGold()] });
  assert.equal(calculateTotalPrice(o, spots), 3000, "an ounce of gold was valued at zero");
});

// The declared value is what a return is insured for. Valuing this at zero
// means posting an ounce of gold back uninsured.
test("a return's declared value counts a scrap line with no premium", () => {
  const o = order({ order_items: [unpricedGold()] });
  assert.equal(calculateReturnDeclaredValue(o, spots), 3000, "the return would be uninsured");
});

test("getScrapTotal counts a scrap line with no premium", () => {
  assert.equal(getScrapTotal([unpricedGold()], spots), 3000);
});

// The line's own premium still wins where it has one - the fallback must not
// override a real value.
test("an explicit premium still beats the scrap row's", () => {
  const item = { ...unpricedGold(), premium: 0.9 };
  assert.equal(calculateItemPrice(item, spots), 3600);
});

// And a line with neither is zero rather than NaN.
test("a scrap line with no premium anywhere is worth zero, not NaN", () => {
  const item = { item_type: "scrap", premium: null, scrap: { metal: "Gold", content: 1 } };
  assert.equal(calculateItemPrice(item, spots), 0);
});
