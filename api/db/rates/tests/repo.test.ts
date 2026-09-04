// Writes on rates.rates, against real Postgres. Self-contained: metal_id is
// the only foreign key, resolved by name from the seed - no lock required.
import { test, afterAll, beforeAll } from "vitest";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import type { PoolClient } from "pg";
import pool from "#pool";
import { inRollback } from "#shared/testing/rollback.ts";
import { metalId } from "#shared/testing/builders/index.ts";
import * as rates from "#db/rates/repo.ts";

beforeAll(async () => {
  assert.equal(
    new Date().getTimezoneOffset(), 0,
    "these tests require TZ=UTC - run them with `pnpm --filter @dorado/api test`"
  );
});

afterAll(async () => {
  await pool.end();
});

const aRateRow = async (c: PoolClient) =>
  rates.create(
    {
      metal_id: await metalId(c, "Gold"),
      unit: "oz", min_qty: 0, max_qty: 10, scrap_pct: 0.9, bullion_pct: 0.95,
    },
    c
  );

test("update writes a real rate band and answers the written row", async () => {
  await inRollback(async (c: PoolClient) => {
    const row = await aRateRow(c);

    const written = await rates.update(row.id, { scrap_pct: 0.88, max_qty: null }, c);
    assert.equal(Number(written?.scrap_pct), 0.88);
    assert.equal(written?.max_qty, null, "max_qty was not cleared to open-ended");
    assert.deepEqual(written, await rates.getOne(row.id, c));
  });
});

test("update answers undefined for an id with no rate row", async () => {
  await inRollback(async (c: PoolClient) => {
    const written = await rates.update(randomUUID(), { scrap_pct: 0.5 }, c);
    assert.equal(written, undefined, "update answered a row for a rate that does not exist");
  });
});

test("remove deletes a real rate band and answers false the second time", async () => {
  await inRollback(async (c: PoolClient) => {
    const row = await aRateRow(c);

    const removed = await rates.remove(row.id, c);
    assert.equal(removed, true, "remove reported no row changed");
    assert.equal(await rates.getOne(row.id, c), undefined);

    const removedAgain = await rates.remove(row.id, c);
    assert.equal(removedAgain, false, "remove reported a change for a rate already gone");
  });
});
