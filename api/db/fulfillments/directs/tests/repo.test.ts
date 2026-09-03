// Writes on fulfillments.directs, against real Postgres. Self-contained: the fulfillment each direct hangs off is a draft (no order).
import { test, afterAll, beforeAll } from "vitest";
import assert from "node:assert/strict";
import type { PoolClient } from "pg";
import { randomUUID } from "node:crypto";
import pool from "#db";
import * as directs from "#db/fulfillments/directs/repo.ts";
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

async function aLocationId(c: PoolClient): Promise<string> {
  const { rows: [l] } = await c.query(`SELECT id FROM places.locations LIMIT 1`);
  assert.ok(l, "dev has no places.locations row");
  return l.id;
}

test("upsert books an appointment, defaulting is_appointment to true", async () => {
  await inRollback(async (c: PoolClient) => {
    const fulfillment_id = await aDraftFulfillment(c);
    const location_id = await aLocationId(c);

    const row = await directs.upsert({ id: randomUUID(), fulfillment_id, location_id }, c);
    assert.equal(row.is_appointment, true, "is_appointment did not default to true");

    const walkin = await directs.upsert(
      { id: randomUUID(), fulfillment_id, location_id, is_appointment: false }, c
    );
    assert.equal(walkin.id, row.id, "a second call created a second row instead of rescheduling");
    assert.equal(walkin.is_appointment, false, "an explicit false was overridden by the default");
  });
});

test("remove deletes the direct and answers false the second time", async () => {
  await inRollback(async (c: PoolClient) => {
    const fulfillment_id = await aDraftFulfillment(c);
    const location_id = await aLocationId(c);
    await directs.upsert({ id: randomUUID(), fulfillment_id, location_id }, c);

    const removed = await directs.remove(fulfillment_id, c);
    assert.equal(removed, true, "remove reported no row changed");
    assert.equal(await directs.getFor(fulfillment_id, c), undefined);

    const removedAgain = await directs.remove(fulfillment_id, c);
    assert.equal(removedAgain, false, "remove reported a change for a direct already gone");
  });
});
