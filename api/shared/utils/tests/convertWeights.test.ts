// Weight conversion exists THREE times (here, the frontend copy, and the SQL function metals.convert_to_troy_oz) — a scrap line's content * spot * premium is what a customer is paid, so three copies disagreeing is a pricing bug, not untidiness.
// The frontend copy had a test; THIS one — what the API actually pays people with — had none, and nothing compared it to the SQL function. This does both.
import { test, afterAll, beforeAll } from "vitest";
import assert from "node:assert/strict";
import pool from "#db";
import type { PoolClient } from "pg";
import { convertTroyOz } from "#shared/utils/convertWeights.ts";

// Only reads, and only calls a pure function, so there is nothing to roll back.
let client: PoolClient;
beforeAll(async () => { client = await pool.connect(); });
afterAll(async () => { client?.release(); });

// `val` really is nullable: the last test asserts the SQL function returns
// NULL for a null weight where the JavaScript one returns 0. That difference is
// the point of the file, so the signature has to admit it.
const sql = async (val: number | null, unit: string): Promise<number | null> => {
  const { rows } = await client.query("select metals.convert_to_troy_oz($1, $2) as oz", [val, unit]);
  return rows[0].oz;
};

const UNITS = ["t oz", "g", "dwt", "lb"];

test("converts each unit the business actually quotes in", () => {
  assert.equal(convertTroyOz(1, "t oz"), 1);
  assert.ok(Math.abs(convertTroyOz(31.1035, "g") - 1) < 1e-10);
  assert.equal(convertTroyOz(20, "dwt"), 1);
  assert.ok(Math.abs(convertTroyOz(1, "lb") - 14.5833105) < 1e-6);
});

test("matches the unit case-insensitively", () => {
  assert.equal(convertTroyOz(1, "T OZ"), 1);
  assert.equal(convertTroyOz(20, "DWT"), 1);
});

test("NaN and an unknown unit are both worth zero rather than throwing", () => {
  assert.equal(convertTroyOz(NaN, "g"), 0);
  assert.equal(convertTroyOz(100, "kg"), 0);
  assert.equal(convertTroyOz(100, ""), 0);
});

// The point of the file. If these drift, one of them is quoting a weight the
// other is not paying for.
test("the SQL function agrees with this one on every unit anyone uses", async () => {
  for (const unit of UNITS) {
    for (const val of [0, 1, 7.25, 453.592, 1000]) {
      const js = convertTroyOz(val, unit);
      const db = Number(await sql(val, unit));
      assert.ok(
        Math.abs(js - db) < 1e-9,
        `${val} ${unit}: javascript says ${js}, the database says ${db}`
      );
    }
  }
});

test("and agrees case-insensitively too", async () => {
  for (const unit of ["T OZ", "G", "DWT", "LB"]) {
    const js = convertTroyOz(10, unit);
    const db = Number(await sql(10, unit));
    assert.ok(Math.abs(js - db) < 1e-9, `10 ${unit}: ${js} vs ${db}`);
  }
});

// The one documented difference, pinned so changing either is deliberate — zero is more dangerous (silently worth nothing, nothing says it failed) than NULL (which at least propagates); nothing calls the SQL function today, so this is latent.
test("they part company on a unit nobody uses - zero here, NULL in the database", async () => {
  for (const unit of ["kg", "oz", "stone", ""]) {
    assert.equal(convertTroyOz(100, unit), 0, `javascript should zero "${unit}"`);
    assert.equal(await sql(100, unit), null, `the database should NULL "${unit}"`);
  }
});

test("a null weight is null in the database, where javascript would give zero", async () => {
  assert.equal(await sql(null, "g"), null);
  assert.equal(convertTroyOz(NaN, "g"), 0);
});
