// places.addresses, the CRUD floor, against real Postgres.
//
// One test proves what every repo's update must: a missing id changes nothing
// and says so (false), a real id changes exactly one row and says so (true).
import test, { after, before } from "node:test";
import assert from "node:assert/strict";
import type { PoolClient } from "pg";
import pool from "#db";
import * as repo from "#db/places/addresses/repo.ts";

let client: PoolClient;

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

async function inRollback(fn: (c: PoolClient) => Promise<void>) {
  await client.query("BEGIN");
  try {
    await fn(client);
  } finally {
    await client.query("ROLLBACK");
  }
}

const NOBODY = "00000000-0000-0000-0000-000000000000";

test("update returns false on a missing id", async () => {
  await inRollback(async (c) => {
    const ok = await repo.update(NOBODY, { city: "Nowhere" }, c);
    assert.equal(ok, false);
  });
});

test("update returns true on a real id, and only touches the columns in the patch", async () => {
  await inRollback(async (c) => {
    const created = await repo.create("11111111-1111-1111-1111-111111111111", {
      line_1: "1 Test St", city: "Austin", state: "TX", zip: "78701",
    }, c);
    const ok = await repo.update(created.id, { city: "Dallas" }, c);
    assert.equal(ok, true);

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
    const ok = await repo.update(created.id, { line_2: null }, c);
    assert.equal(ok, true);

    const row = await repo.getOne(created.id, c);
    assert.equal(row?.line_2, null);
    assert.equal(row?.line_1, "1 Test St", "an unrelated column must not change");
  });
});
