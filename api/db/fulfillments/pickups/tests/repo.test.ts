// Writes on fulfillments.pickups, against real Postgres. Self-contained: the fulfillment each pickup hangs off is a draft (no order).
import { test, afterAll, beforeAll } from "vitest";
import assert from "node:assert/strict";
import type { PoolClient } from "pg";
import { randomUUID } from "node:crypto";
import pool from "#db";
import * as pickups from "#db/fulfillments/pickups/repo.ts";
import * as fulfillments from "#db/fulfillments/repo.ts";

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
    await fn(client);
  } finally {
    await client.query("ROLLBACK");
  }
}

async function aDraftFulfillment(c: PoolClient): Promise<string> {
  const { rows: [m] } = await c.query(`SELECT id FROM fulfillments.methods LIMIT 1`);
  assert.ok(m, "dev has no fulfillments.methods row");
  const draft = await fulfillments.createDraft({ id: randomUUID(), method_id: m.id }, c);
  return draft.id;
}

async function anAddressId(c: PoolClient): Promise<string> {
  const { rows: [a] } = await c.query(`SELECT id FROM places.addresses LIMIT 1`);
  assert.ok(a, "dev has no places.addresses row");
  return a.id;
}

test("create books a pickup, and update reschedules the same row", async () => {
  await inRollback(async (c: PoolClient) => {
    const fulfillment_id = await aDraftFulfillment(c);
    const pickup_address_id = await anAddressId(c);

    const first = await pickups.create(
      { id: randomUUID(), fulfillment_id, pickup_address_id, start_time: "2026-01-05 09:00:00" },
      c
    );
    assert.equal(first.fulfillment_id, fulfillment_id);

    const changed = await pickups.update(
      fulfillment_id, { start_time: "2026-01-06 10:00:00" }, c
    );
    assert.equal(changed, true, "update reported no row changed");

    const second = await pickups.getFor(fulfillment_id, c);
    assert.equal(second?.id, first.id, "rescheduling created a second row instead of updating the first");
    assert.equal(
      new Date(second?.start_time as string).toISOString().startsWith("2026-01-06"), true,
      `expected the rescheduled start_time to land on 2026-01-06, got ${second?.start_time}`
    );
  });
});

test("remove deletes the pickup and answers false the second time", async () => {
  await inRollback(async (c: PoolClient) => {
    const fulfillment_id = await aDraftFulfillment(c);
    const pickup_address_id = await anAddressId(c);
    await pickups.create({ id: randomUUID(), fulfillment_id, pickup_address_id }, c);

    const removed = await pickups.remove(fulfillment_id, c);
    assert.equal(removed, true, "remove reported no row changed");
    assert.equal(await pickups.getFor(fulfillment_id, c), undefined);

    const removedAgain = await pickups.remove(fulfillment_id, c);
    assert.equal(removedAgain, false, "remove reported a change for a pickup already gone");
  });
});
