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
import { test, afterAll, beforeAll } from "vitest";
import assert from "node:assert/strict";
import type { PoolClient } from "pg";
import pool from "#db";
// Both names now come from the one service. `getFromId` returning a LIST and
// `getAddressFromId` returning a ROW is the distinction this whole file exists
// to pin, and the restructure kept both - so the pair is still testable, it is
// just no longer split across a repo and a service.
import * as addressService from "#domain/places/addresses/service.ts";
import * as taxRepo from "#domain/sales-tax/service.ts";
import { inPinnedTransaction, outside } from "#shared/testing/pinned-pool.ts";
import { TEST_ACTOR } from "#shared/testing/actor.ts";
import { LOCKS } from "#shared/testing/locks.ts";
import { aUser, anAddress } from "#shared/testing/builders/index.ts";

// THE STRUCTURAL SUBSET THE FIXTURE QUERY ASKS FOR. A SELECT projection, not
// a table row.
type RuleFixture = {
  id: string;
  state: string;
  tax_rate: string;
  metal_category: string;
  product_type: string;
  min_price: string | null;
  max_price: string | null;
  purity_min: string | null;
  purity_max: string | null;
  aggregate_min: string | null;
  aggregate_max: string | null;
  weight_min: string | null;
  weight_max: string | null;
};

let ruleState: string;
let rule: RuleFixture;
let item: Record<string, unknown>;
let price: number;
let aggregate: number;

beforeAll(async () => {
  // The rule alone - a real, taxing sales-tax rule from tax.sales_tax_rules
  // (business config, not something any test writes). Everything below is
  // derived from this one row, so the fixture cannot drift from the data.
  //
  // NO ADDRESS IS DISCOVERED HERE ANY MORE. An earlier version joined
  // places.addresses to find one already in the rule's state, and that was
  // flaky: places.addresses is NOT frozen the way exchange.addresses was -
  // other tests in the suite build and (a few, deliberately) commit real rows
  // there, so a tied LIMIT 1 could pick a row another test deletes moments
  // later. Each test below builds its OWN address, in this state, inside its
  // own pinned transaction instead - see anAddress calls below.
  const rows = await outside<RuleFixture>(
    `SELECT id, state_code AS state, tax_rate, metal_category, product_type,
            min_price, max_price, purity_min, purity_max,
            aggregate_min, aggregate_max, weight_min, weight_max
       FROM tax.sales_tax_rules
      WHERE tax_rate > 0
      ORDER BY tax_rate DESC, id ASC
      LIMIT 1`
  );
  rule = rows[0];
  assert.ok(
    rule,
    "dev has no sales-tax rule that charges tax - the suite would prove nothing"
  );
  ruleState = rule.state;

  const between = (lo: string | null, hi: string | null, want: number) => Math.min(Math.max(want, Number(lo)), Number(hi));

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

afterAll(async () => {
  await pool.end();
});

test("getFromId returns a list, so reading .state off it is undefined", async () => {
  await inPinnedTransaction(async (c: PoolClient) => {
    const owner = await aUser(c);
    const built = await anAddress(c, owner, { state: ruleState });
    const address = await addressService.getFromId(built.id);

    assert.ok(Array.isArray(address), "getFromId returns rows, not a row");
    // `address.state` is what the defective call sites wrote, and TypeScript
    // REFUSES it on a ComposedAddress[] - which is the finding, not an
    // obstacle: had those call sites ever been typechecked against this
    // list-returning signature, the bug could not have been written. Spelled
    // as the own-property lookup the runtime actually performs, so the claim
    // is unchanged and it compiles.
    assert.equal(
      Object.getOwnPropertyDescriptor(address, "state")?.value,
      undefined,
      "this is the value both sales-order paths pass as the taxing state"
    );
    assert.equal(address[0].state, ruleState, "the state is one level down");
  }, { actor: TEST_ACTOR.id, lock: LOCKS.ADDRESSES });
});

test("a real state and an undefined one are answered differently", async () => {
  await inPinnedTransaction(async (c: PoolClient) => {
    const withState = await taxRepo.rateForItem(ruleState, item, price, aggregate, c);
    // DELIBERATELY OUTSIDE THE DECLARED TYPE, and pinned from both sides.
    // rateForItem declares `state: string | null`, and the whole point of this
    // file is that the live paths passed `undefined` - a value the signature
    // has never admitted. The two are NOT interchangeable at runtime: the
    // nexus guard reads `state !== null`, so null short-circuits and undefined
    // does not, and substituting one would change what this test proves.
    // A @ts-expect-error rather than a cast, so widening the parameter to
    // `string | null | undefined` FAILS here and forces this note out.
    // @ts-expect-error - undefined is exactly the value the defect supplied
    const withUndefined = await taxRepo.rateForItem(undefined, item, price, aggregate, c);

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
  }, { actor: TEST_ACTOR.id, lock: LOCKS.ADDRESSES });
});

// The other half: what the two sales-order paths read now. Without this the
// suite would only record the defect and would not notice it coming back the
// other way - a change to getAddressFromId that made IT return a list too.
test("getAddressFromId returns the row, so .state is the state", async () => {
  await inPinnedTransaction(async (c: PoolClient) => {
    const owner = await aUser(c);
    const built = await anAddress(c, owner, { state: ruleState });
    const address = await addressService.getAddressFromId(built.id);

    // GUARDED: getAddressFromId returns `| undefined`, and both tests below
    // read `.state` off it directly. A fixture address that stopped resolving
    // TypeError'd instead of saying which id failed. Surfaced by the
    // conversion.
    assert.ok(address, `getAddressFromId could not read address ${built.id}`);
    assert.ok(!Array.isArray(address), "this one is a row");
    assert.equal(address.state, ruleState);
    assert.equal(typeof address.state, "string");
  }, { actor: TEST_ACTOR.id, lock: LOCKS.ADDRESSES });
});

test("the taxing state now yields the rate the rule says, not zero", async () => {
  await inPinnedTransaction(async (c: PoolClient) => {
    const owner = await aUser(c);
    const built = await anAddress(c, owner, { state: ruleState });
    const address = await addressService.getAddressFromId(built.id);
    assert.ok(address, `getAddressFromId could not read address ${built.id}`);
    assert.equal(address.state, ruleState, "the fixture address is in the charging state");

    const rate = await taxRepo.rateForItem(address.state, item, price, aggregate, c);
    assert.ok(rate > 0, "a real state reached the rules");
    assert.equal(Number(rate), Number(rule.tax_rate));
  }, { actor: TEST_ACTOR.id, lock: LOCKS.ADDRESSES });
});
