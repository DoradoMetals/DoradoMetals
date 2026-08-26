// The state a sales order is taxed in.
//
// WHY THIS FILE EXISTS. `createSalesOrder` and `adminCreateSalesOrder` both do
//
//     const address = await addressRepo.getFromId(sales_order.address.id);
//     ... taxService.attachSalesTaxToItems(address.state, ...)
//     ... taxRepo.updateStateSalesTax(orderPrices.sales_tax, address.state, ...)
//
// and `addressRepo.getFromId` returns `rows` - a LIST. `address.state` on a
// list is `undefined`, so both call sites tax the order in no state at all.
//
// It came in at cf724c4e, "fix sales order bug", 6 January 2026, which replaced
// `addressService.getAddressFromId` - which returns `rows[0]` - with the repo
// call. That was almost certainly a workaround for the service function having
// been deleted in be03eed3, the December feature-slicing: the same deletion
// that left POST /api/stripe/update_payment_intent answering 500 for eight
// months. One call site was left broken and one was "fixed" into a subtler bug.
//
// WHAT THIS DOES AND DOES NOT CLAIM. It does NOT claim money was lost. In
// production no state has `reached_nexus = true`, so if COLLECTING_NEXUS_TAXES
// is on there, `getSalesTax` returns 0 before the rules are consulted and this
// defect changes nothing today. Exactly one production sales order was placed
// after cf724c4e - a Texas order, and Texas exempts bullion - so there is no
// order whose tax can be shown to be wrong. The exposure is forward: the moment
// a state is marked as having reached nexus, or the flag is turned off, orders
// are taxed against `undefined` and quietly come back zero.
//
// The one production order that DID carry tax - $18.67, Maryland, 27 June 2025
// - predates cf724c4e, which is consistent with the engine working before it.
// Consistent with, not proof of: one data point either side.
//
// NOTHING IS COMMITTED - every statement takes the pinned client.
import test, { after, before } from "node:test";
import assert from "node:assert/strict";
import pool from "#db";
import * as addressRepo from "#features/addresses/repo.js";
import * as addressService from "#features/addresses/service.ts";
import * as taxRepo from "#features/sales-tax/repo.js";
import { inPinnedTransaction, outside } from "#shared/testing/pinned-pool.js";

let addressId, addressState, ruleState, rule, item, price, aggregate;

before(async () => {
  // An address whose state actually has a charging rule, and the rule itself.
  // Everything below is derived from this one row, so the fixture cannot drift
  // from the data.
  //
  // The first version of this test UPDATEd an address into the rule's state
  // inside the pinned transaction and then read it back through
  // addressService.getAddressFromId. That function takes no executor, so it
  // reads through the pool and could not see the update - it returned dev's
  // real state and the assertion passed for the wrong reason. Nothing is
  // written now, which removes the question.
  const rows = await outside(
    `SELECT a.id, a.state, r.tax_rate, r.metal_category, r.product_type,
            r.min_price, r.max_price, r.purity_min, r.purity_max,
            r.aggregate_min, r.aggregate_max, r.weight_min, r.weight_max
     FROM exchange.addresses a
     JOIN exchange.sales_tax_rules r ON r.state_code = a.state
     WHERE r.tax_rate > 0
     ORDER BY r.tax_rate DESC
     LIMIT 1`
  );
  rule = rows[0];
  assert.ok(
    rule,
    "dev has no address in a state that charges tax - the suite would prove nothing"
  );
  addressId = rule.id;
  addressState = rule.state;
  ruleState = rule.state;

  const between = (lo, hi, want) => Math.min(Math.max(want, Number(lo)), Number(hi));

  item = {
    metal_type: rule.metal_category === "All" ? "Gold" : rule.metal_category,
    product_type: rule.product_type === "All" ? "Coin" : rule.product_type,
    purity: between(rule.purity_min, rule.purity_max, 0.5),
    domestic_tender: true,
    legal_tender: true,
    gross: between(rule.weight_min, rule.weight_max, 1),
  };
  price = between(rule.min_price, rule.max_price, 100);
  aggregate = between(rule.aggregate_min, rule.aggregate_max, 100);
});

after(async () => {
  await pool.end();
});

test("getFromId returns a list, so reading .state off it is undefined", async () => {
  await inPinnedTransaction(async () => {
    const address = await addressRepo.getFromId(addressId);

    assert.ok(Array.isArray(address), "getFromId returns rows, not a row");
    assert.equal(
      address.state,
      undefined,
      "this is the value both sales-order paths pass as the taxing state"
    );
    assert.equal(address[0].state, addressState, "the state is one level down");
  });
});

test("a real state and an undefined one are answered differently", async () => {
  await inPinnedTransaction(async (c) => {
    const withState = await taxRepo.getSalesTax(ruleState, item, price, aggregate, c);
    const withUndefined = await taxRepo.getSalesTax(undefined, item, price, aggregate, c);

    // The discriminating half. If dev ever stops producing a rate here, this
    // fails loudly rather than the suite passing against a broken engine.
    assert.ok(
      withState > 0,
      `dev's ${ruleState} rule produced no rate for an item built from it - ` +
        "the comparison below would prove nothing"
    );
    assert.equal(
      withUndefined,
      0,
      "an undefined state matches no rule and COALESCEs to zero, silently"
    );
    assert.notEqual(withState, withUndefined);
  });
});

// The other half: what the two sales-order paths read now. Without this the
// suite would only record the defect and would not notice it coming back the
// other way - a change to getAddressFromId that made IT return a list too.
test("getAddressFromId returns the row, so .state is the state", async () => {
  await inPinnedTransaction(async () => {
    const address = await addressService.getAddressFromId(addressId);

    assert.ok(!Array.isArray(address), "this one is a row");
    assert.equal(address.state, addressState);
    assert.equal(typeof address.state, "string");
  });
});

test("the taxing state now yields the rate the rule says, not zero", async () => {
  await inPinnedTransaction(async (c) => {
    const address = await addressService.getAddressFromId(addressId);
    assert.equal(address.state, ruleState, "the fixture address is in the charging state");

    const rate = await taxRepo.getSalesTax(address.state, item, price, aggregate, c);
    assert.ok(rate > 0, "a real state reached the rules");
    assert.equal(Number(rate), Number(rule.tax_rate));
  });
});
