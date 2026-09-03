import test from "node:test";
import assert from "node:assert/strict";
import {
  calculateTotalPrice,
  calculateItemPrice,
  calculateReturnDeclaredValue,
  effectivePayoutFee,
  getBullionTotal,
  getScrapTotal,
} from "#domain/pricing/service.ts";

const spots = [
  { name: "Gold", bid: 4000 },
  { name: "Silver", bid: 30 },
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

// The invoice is a number or an exception, never NaN — split by MEANING (see bid.ts): an ABSENT payout is no fee, a PRESENT-but-unusable one throws. Each case below is one arm, so reversing the decision fails a named assertion instead of quietly changing an invoice.

// The defect itself — this returned NaN, silently, all the way to the invoice, packing list and stored total.
test("a payout object with no cost is the fee-less case, not NaN", () => {
  const o = order({ order_items: [scrapItem()], payout: {} });
  const total = calculateTotalPrice(o, spots);
  assert.ok(!Number.isNaN(total), "the whole invoice became NaN");
  assert.equal(total, 7200);
});

// What every real read produces for an order with no payout row: compose.ts
// builds EMPTY_PAYOUT, whose `cost` is null. Five dev purchase orders are in
// this state and the app already invoices them.
test("a null payout cost is no payout fee", () => {
  const o = order({ order_items: [scrapItem()], payout: { cost: null } });
  assert.equal(calculateTotalPrice(o, spots), 7200);
});

// Changed deliberately — threw a TypeError until 2026-08-29; a null payout means 'no method chosen yet', and refusing to invoice every order in that state isn't a protection.
test("a missing payout is no payout fee, and does not throw", () => {
  const o = order({ order_items: [scrapItem()], payout: null });
  assert.equal(calculateTotalPrice(o, spots), 7200);
  assert.equal(calculateTotalPrice(order({ order_items: [scrapItem()], payout: undefined }), spots), 7200);
});

// The other arm — a value arrived and couldn't become a number, not the same as one not arriving; defaulting to zero would silently invoice as though no fee applied when one did.
test("a payout cost that is not a number throws rather than defaulting", () => {
  const o = order({ order_items: [scrapItem()], payout: { cost: "not a fee" } });
  assert.throws(() => calculateTotalPrice(o, spots), TypeError);
});

// The shipping side had the `?? 0` all along; it goes through the same function
// now, so it gains the same second arm. Same line, same class of bug.
test("a shipping charge that is not a number throws rather than defaulting", () => {
  const o = order({ order_items: [scrapItem()], shipment: { shipping_charge: "free" } });
  assert.throws(() => calculateTotalPrice(o, spots), TypeError);
});

// A numeric string still works. NUMERIC comes back as a number through the
// parsers in db.ts, but a hand-assembled order or a fixture can carry a string,
// and turning that into a throw would be a regression rather than a guard.
test("a numeric string is still a fee", () => {
  const o = order({ order_items: [scrapItem()], payout: { cost: "50" } });
  assert.equal(calculateTotalPrice(o, spots), 7200 - 50);
});

// Not hypothetical — migration 087 cleaned up rows whose stored content literally reached the wire as the STRING "NaN".
test("a line total that cannot be computed stops the invoice", () => {
  const o = order({ order_items: [scrapItem({ price: Number.NaN })] });
  assert.throws(() => calculateTotalPrice(o, spots), TypeError);
});

// The same gate on the return, where a NaN posts a customer's metal back
// uninsured - the failure bid.ts's header opens with.
test("a return declared value that cannot be computed stops the label", () => {
  const o = order({ order_items: [scrapItem({ scrap: { metal: "Gold", content: Number.NaN } })] });
  assert.throws(() => calculateReturnDeclaredValue(o, spots), TypeError);
});

test("a metal absent from spots throws", () => {
  const o = order({ order_items: [scrapItem({ scrap: { metal: "Platinum", content: 1 } })] });
  assert.throws(() => calculateTotalPrice(o, spots), TypeError);
});


// Every product branch fell back to the row's own premium; no scrap branch did, so such a line was worth nothing — found by comparing two PDFs for the same order. Fixture mirrors dev purchase order 239 (one troy oz gold, no line premium, 0.75 on the row).
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

// A waived fee is not deducted, and the stored fee is NOT rewritten — the whole reason the flag exists rather than an UPDATE to zero (a stored fee is a record).

test("a waived payout fee is not deducted, and the stored fee still says what it was", () => {
  const o = order({
    order_items: [scrapItem()],
    payout: { cost: 20 },
    waive_payout_fee: true,
  });
  assert.equal(calculateTotalPrice(o, spots), 7200, "the waived fee was still deducted");
  // The RECORD is untouched: nothing above rewrote it, and un-waiving reads
  // the same 20 back rather than re-deriving it from the method table.
  assert.equal(o.payout.cost, 20, "waiving overwrote the stored fee");
  assert.equal(effectivePayoutFee(o), 0);
});

test("an unwaived fee is deducted, whatever the flag's other spellings", () => {
  const priced = (waive: unknown) =>
    calculateTotalPrice(
      order({ order_items: [scrapItem()], payout: { cost: 20 }, waive_payout_fee: waive }),
      spots
    );
  // Every production row holds `false` today, and null is what an order with
  // no transactions row composes to. Only `true` waives.
  assert.equal(priced(false), 7180);
  assert.equal(priced(null), 7180);
  assert.equal(priced(undefined), 7180);
});

// The three surfaces that price a payout fee go through ONE expression, so a
// waived order cannot show a deduction on the drawer estimate and none on the
// invoice. This pins the helper's own contract rather than the callers'.
test("effectivePayoutFee is the stored fee unless the order waives it", () => {
  assert.equal(effectivePayoutFee({ payout: { cost: 125 } }), 125);
  assert.equal(effectivePayoutFee({ payout: { cost: 125 }, waive_payout_fee: true }), 0);
  assert.equal(effectivePayoutFee({ payout: null, waive_payout_fee: true }), 0);
  assert.equal(effectivePayoutFee({}), 0);
});
