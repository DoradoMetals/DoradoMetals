import { test, afterAll, beforeAll } from "vitest";
import assert from "node:assert/strict";
import type { PoolClient } from "pg";
import pool from "#pool";
import * as addressService from "#domain/places/addresses/service.ts";
import * as taxRepo from "#domain/sales-tax/service.ts";
import { inPinnedTransaction, outside } from "#shared/testing/pinned-pool.ts";
import { TEST_ACTOR } from "#shared/testing/actor.ts";
import { LOCKS } from "#shared/testing/locks.ts";
import { aUser, anAddress } from "#shared/testing/builders/index.ts";

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

test("a real state and an undefined one are answered differently", async () => {
  await inPinnedTransaction(async (c: PoolClient) => {
    const withState = await taxRepo.rateForItem(ruleState, item, price, aggregate, c);
    // @ts-expect-error - undefined is exactly the value the defect supplied
    const withUndefined = await taxRepo.rateForItem(undefined, item, price, aggregate, c);

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

test("getAddressFromId returns the row, so .state is the state", async () => {
  await inPinnedTransaction(async (c: PoolClient) => {
    const owner = await aUser(c);
    const built = await anAddress(c, owner, { state: ruleState });
    const address = await addressService.getAddressFromId(built.id);

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
