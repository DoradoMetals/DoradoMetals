// Sales tax resolution, against real Postgres.
//
// Eighty-eight rules decide what a customer is charged, and which one wins is
// decided by a seven-clause ORDER BY rather than by anything visible at the
// call site. Getting it wrong charges the wrong tax on a real order, quietly,
// and the customer is the one who finds out.
//
// The specificity tests below insert their own rules for a state code that does
// not exist, inside a transaction that is rolled back. That is deliberate:
// asserting against the live 88 would pin today's rates rather than the
// ordering, and the rates are supposed to change.
import test, { after, before } from "node:test";
import assert from "node:assert/strict";
import pool from "#db";
import * as repo from "#features/sales-tax/repo.exchange.js";

let client;

// The enums these columns use live in `public`, not in `exchange` - the
// migration created same-named ones in `tax`, which is why the genesis backfill
// has to cast through text. Worth knowing before writing a cast here.
//
// A state code no real rule uses, so the inserted rules are the only candidates.
const STATE = "ZZ";

before(async () => {
  assert.equal(
    new Date().getTimezoneOffset(), 0,
    "these tests require TZ=UTC - run them with `pnpm --filter @dorado/api test`"
  );
  client = await pool.connect();
});

after(async () => {
  client.release();
  await pool.end();
});

async function inRollback(fn) {
  await client.query("BEGIN");
  try {
    await fn(client);
  } finally {
    await client.query("ROLLBACK");
  }
}

// Everything a rule needs, with the wide-open defaults the real rows use.
const rule = async (c, over = {}) => {
  const r = {
    state_code: STATE, metal_category: "All", product_type: "All",
    min_price: 0, max_price: 1e12, purity_min: 0, purity_max: 1,
    aggregate_min: 0, aggregate_max: 1e12, weight_min: 0, weight_max: 1e12,
    markup_min_pct: 0, markup_max_pct: 1e12,
    is_domestic: null, is_legal_tender: null, tax_rate: 0.05, ...over,
  };
  await c.query(
    `INSERT INTO exchange.sales_tax_rules (
       id, state_code, metal_category, product_type, min_price, max_price,
       purity_min, purity_max, aggregate_min, aggregate_max,
       weight_min, weight_max, markup_min_pct, markup_max_pct,
       is_domestic, is_legal_tender, tax_rate)
     VALUES (gen_random_uuid(), $1, $2::public.sales_tax_metal_category,
       $3::public.sales_tax_product_type, $4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16)`,
    [r.state_code, r.metal_category, r.product_type, r.min_price, r.max_price,
     r.purity_min, r.purity_max, r.aggregate_min, r.aggregate_max,
     r.weight_min, r.weight_max, r.markup_min_pct, r.markup_max_pct,
     r.is_domestic, r.is_legal_tender, r.tax_rate]
  );
};

// A gold coin, unless told otherwise.
const item = (over = {}) => ({
  metal_type: "Gold", product_type: "Coin", purity: 0.999,
  gross: 1, domestic_tender: true, legal_tender: true, ...over,
});

test("with no rule for the state, nothing is charged", async () => {
  await inRollback(async (c) => {
    assert.equal(await repo.getSalesTax(STATE, item(), 1000, 1000, c), 0);
  });
});

test("a matching rule is charged at its rate", async () => {
  await inRollback(async (c) => {
    await rule(c, { tax_rate: 0.0825 });
    assert.equal(await repo.getSalesTax(STATE, item(), 1000, 1000, c), 0.0825);
  });
});

// The specificity ladder, one rung per test. Each inserts a wide rule and a
// narrow one and asserts the narrow one wins - which is what stops a blanket
// state rate overriding a rule written for one metal.
test("a rule naming the metal beats one saying All", async () => {
  await inRollback(async (c) => {
    await rule(c, { metal_category: "All", tax_rate: 0.01 });
    await rule(c, { metal_category: "Gold", tax_rate: 0.02 });
    assert.equal(await repo.getSalesTax(STATE, item(), 1000, 1000, c), 0.02);
  });
});

test("a rule naming the product type beats one saying All", async () => {
  await inRollback(async (c) => {
    await rule(c, { product_type: "All", tax_rate: 0.01 });
    await rule(c, { product_type: "Coin", tax_rate: 0.03 });
    assert.equal(await repo.getSalesTax(STATE, item(), 1000, 1000, c), 0.03);
  });
});

test("a rule that states domestic tender beats one that does not care", async () => {
  await inRollback(async (c) => {
    await rule(c, { is_domestic: null, tax_rate: 0.01 });
    await rule(c, { is_domestic: true, tax_rate: 0.04 });
    assert.equal(await repo.getSalesTax(STATE, item({ domestic_tender: true }), 1000, 1000, c), 0.04);
  });
});

test("a narrower price band beats an open one", async () => {
  await inRollback(async (c) => {
    await rule(c, { tax_rate: 0.01 });
    await rule(c, { min_price: 500, max_price: 2000, tax_rate: 0.06 });
    assert.equal(await repo.getSalesTax(STATE, item(), 1000, 1000, c), 0.06);
  });
});

test("a narrower purity band beats an open one", async () => {
  await inRollback(async (c) => {
    await rule(c, { tax_rate: 0.01 });
    await rule(c, { purity_min: 0.9, purity_max: 1, tax_rate: 0.07 });
    assert.equal(await repo.getSalesTax(STATE, item(), 1000, 1000, c), 0.07);
  });
});

// The bands are inclusive at both ends, which decides what an order sitting
// exactly on a threshold is charged - and thresholds are where the money is.
test("a price on the edge of a band is inside it", async () => {
  await inRollback(async (c) => {
    await rule(c, { min_price: 1000, max_price: 2000, tax_rate: 0.09 });
    assert.equal(await repo.getSalesTax(STATE, item(), 1000, 1000, c), 0.09, "lower edge excluded");
    assert.equal(await repo.getSalesTax(STATE, item(), 2000, 2000, c), 0.09, "upper edge excluded");
    assert.equal(await repo.getSalesTax(STATE, item(), 999, 999, c), 0, "below the band still charged");
  });
});

// The aggregate threshold is the order total, not the line - several small
// items can cross an exemption a single one would not.
test("the aggregate band is tested against the order total, not the item", async () => {
  await inRollback(async (c) => {
    await rule(c, { aggregate_min: 5000, aggregate_max: 1e12, tax_rate: 0.08 });
    assert.equal(await repo.getSalesTax(STATE, item(), 100, 6000, c), 0.08, "order total ignored");
    assert.equal(await repo.getSalesTax(STATE, item(), 6000, 100, c), 0, "item price used as the aggregate");
  });
});

// A rule that matches nothing about the item must not be reached for.
test("a rule for a different metal is not applied", async () => {
  await inRollback(async (c) => {
    await rule(c, { metal_category: "Silver", tax_rate: 0.05 });
    assert.equal(await repo.getSalesTax(STATE, item({ metal_type: "Gold" }), 1000, 1000, c), 0);
  });
});

test("resolution reads through the caller's transaction", async () => {
  const other = await pool.connect();
  await client.query("BEGIN");
  try {
    await rule(client, { tax_rate: 0.11 });
    assert.equal(await repo.getSalesTax(STATE, item(), 1000, 1000, client), 0.11);
    // The uncommitted rule must not be visible to anyone else.
    assert.equal(await repo.getSalesTax(STATE, item(), 1000, 1000, other), 0);
  } finally {
    await client.query("ROLLBACK");
    other.release();
  }
});

// isNexus is what gates collection when COLLECTING_NEXUS_TAXES is on. No state
// has nexus in dev, so a test asserting "false" would pass without proving
// anything - it is set within the transaction first.
test("nexus is read per state, not assumed", async () => {
  await inRollback(async (c) => {
    const { rows: [s] } = await c.query("SELECT state FROM exchange.state_sales_tax LIMIT 1");
    assert.equal(await repo.isNexus(s.state, c), false);
    await c.query("UPDATE exchange.state_sales_tax SET reached_nexus = true WHERE state = $1", [s.state]);
    assert.equal(await repo.isNexus(s.state, c), true);
  });
});
