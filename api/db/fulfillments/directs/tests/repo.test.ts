import { test, afterAll, beforeAll } from "vitest";
import assert from "node:assert/strict";
import type { PoolClient } from "pg";
import { randomUUID } from "node:crypto";
import pool from "#pool";
import { inRollback } from "#shared/testing/rollback.ts";
import { fulfillmentMethodId } from "#shared/testing/builders/index.ts";
import * as directs from "#db/fulfillments/directs/repo.ts";
import * as fulfillments from "#db/fulfillments/repo.ts";

beforeAll(async () => {
  assert.equal(
    new Date().getTimezoneOffset(), 0,
    "these tests require TZ=UTC - run them with `pnpm --filter @dorado/api test`"
  );
});

afterAll(async () => {
  await pool.end();
});

async function aDraftFulfillment(c: PoolClient): Promise<string> {
  const method_id = await fulfillmentMethodId(c, "CARRIER DROPOFF", "purchase");
  const draft = await fulfillments.createDraft({ id: randomUUID(), method_id }, c);
  return draft.id;
}

async function aLocationId(c: PoolClient): Promise<string> {
  const { rows: [l] } = await c.query(
    `SELECT id FROM places.locations WHERE name = $1`, ["Dorado Return Address"]
  );
  assert.ok(l, "the places.locations seed is missing - run provision:test");
  return l.id;
}

test("create books an appointment, defaulting is_appointment to true; update reschedules the same row", async () => {
  await inRollback(async (c: PoolClient) => {
    const fulfillment_id = await aDraftFulfillment(c);
    const location_id = await aLocationId(c);

    const row = await directs.create({ id: randomUUID(), fulfillment_id, location_id }, c);
    assert.equal(row.is_appointment, true, "is_appointment did not default to true");

    const changed = await directs.update(fulfillment_id, { is_appointment: false }, c);
    assert.equal(changed, true, "update reported no row changed");

    const walkin = await directs.getFor(fulfillment_id, c);
    assert.equal(walkin?.id, row.id, "a second call created a second row instead of rescheduling");
    assert.equal(walkin?.is_appointment, false, "an explicit false was overridden by the default");
  });
});

test("remove deletes the direct and answers false the second time", async () => {
  await inRollback(async (c: PoolClient) => {
    const fulfillment_id = await aDraftFulfillment(c);
    const location_id = await aLocationId(c);
    await directs.create({ id: randomUUID(), fulfillment_id, location_id }, c);

    const removed = await directs.remove(fulfillment_id, c);
    assert.equal(removed, true, "remove reported no row changed");
    assert.equal(await directs.getFor(fulfillment_id, c), undefined);

    const removedAgain = await directs.remove(fulfillment_id, c);
    assert.equal(removedAgain, false, "remove reported a change for a direct already gone");
  });
});
