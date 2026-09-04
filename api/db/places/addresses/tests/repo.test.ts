// places.addresses, the CRUD floor, against real Postgres.
//
// One test proves what every repo's update must: a missing id changes nothing
// and says so (undefined), a real id changes exactly one row and answers it.
import { test, afterAll, beforeAll } from "vitest";
import assert from "node:assert/strict";
import type { PoolClient } from "pg";
import pool from "#pool";
import { inRollback } from "#shared/testing/rollback.ts";
import * as repo from "#db/places/addresses/repo.ts";


beforeAll(async () => {
  assert.equal(
    new Date().getTimezoneOffset(), 0,
    "these tests require TZ=UTC - run them with `pnpm --filter @dorado/api test`"
  );
});

afterAll(async () => {
  await pool.end();
});

const NOBODY = "00000000-0000-0000-0000-000000000000";

test("update answers undefined on a missing id", async () => {
  await inRollback(async (c) => {
    assert.equal(await repo.update(NOBODY, { city: "Nowhere" }, c), undefined);
  });
});

test("update answers the row on a real id, and only touches the columns in the patch", async () => {
  await inRollback(async (c) => {
    const created = await repo.create("11111111-1111-1111-1111-111111111111", {
      line_1: "1 Test St", city: "Austin", state: "TX", zip: "78701",
    }, c);
    const back = await repo.update(created.id, { city: "Dallas" }, c);
    assert.equal(back?.city, "Dallas", "the update did not answer the row it wrote");

    const row = await repo.getOne(created.id, c);
    assert.equal(row?.city, "Dallas");
    assert.equal(row?.line_1, "1 Test St", "a column absent from the patch must not change");
  });
});

test("a patch key present with value null clears that column", async () => {
  await inRollback(async (c) => {
    const created = await repo.create("22222222-2222-2222-2222-222222222222", {
      line_1: "1 Test St", line_2: "Apt 4", city: "Austin",
    }, c);
    const back = await repo.update(created.id, { line_2: null }, c);
    assert.equal(back?.line_2, null);

    const row = await repo.getOne(created.id, c);
    assert.equal(row?.line_2, null);
    assert.equal(row?.line_1, "1 Test St", "an unrelated column must not change");
  });
});
