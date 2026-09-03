// The write on refiners.orders (the refiner ENGAGEMENT), against real Postgres. refiner_id is carried by its own "was this field named" flag rather than COALESCE — see the repo's own header for why.
import { test, afterAll, beforeAll } from "vitest";
import assert from "node:assert/strict";
import type { PoolClient } from "pg";
import { randomUUID } from "node:crypto";
import pool from "#db";
import { LOCKS, takeLocks } from "#shared/testing/locks.ts";
import * as refinerOrders from "#db/refiners/orders/repo.ts";

let client: PoolClient;

beforeAll(async () => {
  assert.equal(
    new Date().getTimezoneOffset(), 0,
    "these tests require TZ=UTC - run them with `pnpm --filter @dorado/api test`"
  );
  client = await pool.connect();
});

afterAll(async () => {
  client.release();
  await pool.end();
});

async function inRollback(fn: (c: PoolClient) => Promise<void>) {
  await client.query("BEGIN");
  try {
    await takeLocks(client, LOCKS.ORDERS);
    await fn(client);
  } finally {
    await client.query("ROLLBACK");
  }
}

test("update writes the pool/fee columns and leaves refiner_id alone", async () => {
  await inRollback(async (c: PoolClient) => {
    const { rows: [row] } = await c.query(`SELECT id, refiner_id FROM refiners.orders ORDER BY id LIMIT 1`);
    assert.ok(row, "dev has no refiners.orders row to test against");

    const changed = await refinerOrders.update(
      row.id, { pool_oz_deducted: 1.5, pool_remediation: 0.2, fee: 25 }, c
    );
    assert.equal(changed, true, "update reported no row changed");

    const { rows: [after] } = await c.query(
      `SELECT pool_oz_deducted, pool_remediation, fee, refiner_id FROM refiners.orders WHERE id = $1`,
      [row.id]
    );
    assert.equal(Number(after.pool_oz_deducted), 1.5);
    assert.equal(Number(after.pool_remediation), 0.2);
    assert.equal(Number(after.fee), 25);
    assert.equal(after.refiner_id, row.refiner_id, "refiner_id changed though the patch never named it");
  });
});

// The condition is CREATED, not found (the same reason spots' own create test
// gives): whether dev happens to hold an engagement with a refiner already
// attached is not this test's business.
test("refiner_id can be explicitly cleared to null", async () => {
  await inRollback(async (c: PoolClient) => {
    const { rows: [row] } = await c.query(`SELECT id FROM refiners.orders ORDER BY id LIMIT 1`);
    assert.ok(row, "dev has no refiners.orders row to test against");
    const { rows: [refiner] } = await c.query(`SELECT id FROM refiners.refiners LIMIT 1`);
    assert.ok(refiner, "dev has no refiners.refiners row to test against");
    await c.query(`UPDATE refiners.orders SET refiner_id = $1 WHERE id = $2`, [refiner.id, row.id]);

    const changed = await refinerOrders.update(row.id, { refiner_id: null }, c);
    assert.equal(changed, true, "update reported no row changed");

    const { rows: [after] } = await c.query(`SELECT refiner_id FROM refiners.orders WHERE id = $1`, [row.id]);
    assert.equal(after.refiner_id, null, "refiner_id was not cleared");
  });
});

test("update answers false for an id with no refiners.orders row", async () => {
  await inRollback(async (c: PoolClient) => {
    const changed = await refinerOrders.update(randomUUID(), { fee: 1 }, c);
    assert.equal(changed, false, "update reported a change for an id that does not exist");
  });
});
