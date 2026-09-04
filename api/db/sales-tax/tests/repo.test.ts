// db/sales-tax/repo.ts, against real Postgres. No create/update/remove of its
// own to prove false-on-missing/true-on-real against - tax.sales_tax is one
// row per US state, seeded once and never created or deleted at runtime (see
// repo.ts's own header). What it DOES write is `accrue`, an UPDATE scoped to
// `reached_nexus = true` - a state below its threshold matches no row on
// purpose (repo.ts: "the correct outcome, not an error"), so THIS is the
// false-on-missing/true-on-real shape for this table: accrue changes the row
// when nexus is reached and silently changes nothing when it is not.
//
// A real state is TOGGLED here rather than discovered: which of the fifty
// happens to have reached_nexus true today is data, not a fact this test
// should depend on (see shared/testing/builders/reference.ts's own rule about
// discovery vs a fixture's own literal).
import { test, afterAll, beforeAll } from "vitest";
import assert from "node:assert/strict";
import type { PoolClient } from "pg";
import pool from "#pool";
import query from "#shared/db/query.ts";
import { inRollback } from "#shared/testing/rollback.ts";
import * as salesTax from "#db/sales-tax/repo.ts";

beforeAll(async () => {
  assert.equal(
    new Date().getTimezoneOffset(), 0,
    "these tests require TZ=UTC - run them with `pnpm --filter @dorado/api test`"
  );
});

afterAll(async () => {
  await pool.end();
});

async function aState(c: PoolClient): Promise<string> {
  const { rows } = await query<{ state: string }>(
    `SELECT state FROM tax.sales_tax ORDER BY state LIMIT 1`, [], c
  );
  if (!rows[0]) {
    throw new Error(
      "tax.sales_tax has no rows - it is seeded from exchange.state_sales_tax " +
      "by migration 029; run `pnpm --filter @dorado/api provision:test -- --commit`"
    );
  }
  return rows[0].state;
}

test("reachedNexus reports the state's own flag, both ways", async () => {
  await inRollback(async (c: PoolClient) => {
    const state = await aState(c);

    await query(`UPDATE tax.sales_tax SET reached_nexus = true WHERE state = $1`, [state], c);
    assert.equal(await salesTax.reachedNexus(state, c), true);

    await query(`UPDATE tax.sales_tax SET reached_nexus = false WHERE state = $1`, [state], c);
    assert.equal(await salesTax.reachedNexus(state, c), false);
  });
});

test("reachedNexus answers false for a state that is not two letters of anything real", async () => {
  await inRollback(async (c: PoolClient) => {
    assert.equal(await salesTax.reachedNexus("ZZ", c), false);
  });
});

test("accrue adds to what a nexus state is owed", async () => {
  await inRollback(async (c: PoolClient) => {
    const state = await aState(c);
    await query(
      `UPDATE tax.sales_tax SET reached_nexus = true, amount_owed = 100 WHERE state = $1`,
      [state], c
    );

    await salesTax.accrue(25.5, state, c);

    const { rows } = await query<{ amount_owed: number }>(
      `SELECT amount_owed FROM tax.sales_tax WHERE state = $1`, [state], c
    );
    assert.equal(Number(rows[0]?.amount_owed), 125.5);
  });
});

test("accrue against a state below its nexus threshold changes nothing - the zero-row update is correct, not silent failure", async () => {
  await inRollback(async (c: PoolClient) => {
    const state = await aState(c);
    await query(
      `UPDATE tax.sales_tax SET reached_nexus = false, amount_owed = 100 WHERE state = $1`,
      [state], c
    );

    await salesTax.accrue(25.5, state, c);

    const { rows } = await query<{ amount_owed: number }>(
      `SELECT amount_owed FROM tax.sales_tax WHERE state = $1`, [state], c
    );
    assert.equal(
      Number(rows[0]?.amount_owed), 100,
      "accrue added to a state that has not reached economic nexus"
    );
  });
});

test("allRules answers every seeded sales-tax rule", async () => {
  await inRollback(async (c: PoolClient) => {
    const rules = await salesTax.allRules(c);
    assert.ok(rules.length > 0, "tax.sales_tax_rules is empty");
    for (const rule of rules) {
      assert.equal(typeof rule.id, "string");
      assert.equal(typeof rule.state_code, "string");
    }
  });
});
