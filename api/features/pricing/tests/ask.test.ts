import test from "node:test";
import assert from "node:assert/strict";
import {
  calculateItemAsk,
  calculateCardCharge,
  calculateItemTotals,
  getShippingCharge,
  calculateSalesTax,
  calculateSalesOrderTotal,
} from "#features/pricing/service.ts";

// The composed spot shape (`name` / `ask`) - what getSpotPrices serves and
// what the calculations read since D84.
const spots = [
  { name: "Gold", ask: 4000 },
  { name: "Silver", ask: 30 },
];

const item = (over = {}) => ({
  metal_type: "Silver",
  content: 1,
  ask_premium: 1.1,
  quantity: 1,
  sales_tax_rate: 0,
  ...over,
});

test("an item's ask is content x ask spot x ask premium", () => {
  assert.equal(calculateItemAsk(item(), spots), 33);
});

// Unlike the purchase-order side, these default a missing spot to zero rather
// than throwing. That turns an unpriced metal into a free item instead of an
// error, so it is pinned here deliberately.
test("an item whose metal is absent from spots asks zero", () => {
  assert.equal(calculateItemAsk(item({ metal_type: "Platinum" }), spots), 0);
  assert.equal(calculateItemAsk(item(), []), 0);
});

test("item totals apply quantity", () => {
  assert.equal(calculateItemTotals([item({ quantity: 4 })], spots), 132);
});

test("card charges are 0.5% for ACH and 2.9% otherwise", () => {
  assert.equal(calculateCardCharge(1000, "ACH"), 5);
  assert.equal(calculateCardCharge(1000, "CARD"), 29);
  assert.equal(calculateCardCharge(1000, undefined), 29);
});

test("shipping is free over 1000, otherwise by service", () => {
  assert.equal(getShippingCharge(1000.01, "OVERNIGHT"), 0);
  assert.equal(getShippingCharge(1000, "OVERNIGHT"), 50);
  assert.equal(getShippingCharge(1000, "STANDARD"), 25);
  assert.equal(getShippingCharge(1000, "PIGEON"), 0);
});

// Exactly 1000 is not free - the threshold is strictly greater than.
test("an order of exactly 1000 still pays shipping", () => {
  assert.equal(getShippingCharge(1000, "STANDARD"), 25);
});

test("sales tax is per item ask x quantity x rate", () => {
  const items = [item({ quantity: 2, sales_tax_rate: 0.1 })];
  // 33 x 2 x 0.1
  assert.equal(calculateSalesTax(items, spots), 6.6000000000000005);
});

test("an order total with no funds applied charges the card on everything", () => {
  const items = [item({ content: 1, ask_premium: 1 })]; // 30
  const t = calculateSalesOrderTotal(items, false, spots, { dorado_funds: 0 }, "STANDARD", "CARD");
  assert.equal(t.item_total, 30);
  assert.equal(t.shipping_charge, 25);
  assert.equal(t.sales_tax, 0);
  assert.equal(t.base_total, 55);
  assert.equal(t.pre_charges_amount, 0);
  assert.equal(t.charges_amount, calculateCardCharge(55, "CARD"));
  assert.equal(t.order_total, 55 + t.charges_amount);
});

test("account funds cover the order and no card charge is taken", () => {
  const items = [item({ content: 1, ask_premium: 1 })]; // 30, +25 shipping
  const t = calculateSalesOrderTotal(items, true, spots, { dorado_funds: 500 }, "STANDARD", "CARD");
  assert.equal(t.base_total, 55);
  assert.equal(t.pre_charges_amount, 55);
  assert.equal(t.subject_to_charges_amount, 0);
  assert.equal(t.charges_amount, 0);
  assert.equal(t.ending_funds, 445);
  assert.equal(t.order_total, 55);
});

test("partial funds leave the remainder subject to card charges", () => {
  const items = [item({ content: 1, ask_premium: 1 })];
  const t = calculateSalesOrderTotal(items, true, spots, { dorado_funds: 20 }, "STANDARD", "ACH");
  assert.equal(t.pre_charges_amount, 20);
  assert.equal(t.subject_to_charges_amount, 35);
  assert.equal(t.ending_funds, 0);
  assert.equal(t.charges_amount, calculateCardCharge(35, "ACH"));
  assert.equal(t.order_total, 20 + 35 + t.charges_amount);
});

test("funds are never over-applied beyond the order total", () => {
  const items = [item({ content: 1, ask_premium: 1 })];
  const t = calculateSalesOrderTotal(items, true, spots, { dorado_funds: 1e6 }, "STANDARD", "CARD");
  assert.equal(t.pre_charges_amount, t.base_total);
  assert.equal(t.ending_funds, 1e6 - t.base_total);
});

test("a user with no funds recorded is treated as zero", () => {
  const items = [item({ content: 1, ask_premium: 1 })];
  const t = calculateSalesOrderTotal(items, true, spots, {}, "STANDARD", "CARD");
  assert.equal(t.beginning_funds, 0);
  assert.equal(t.pre_charges_amount, 0);
});
