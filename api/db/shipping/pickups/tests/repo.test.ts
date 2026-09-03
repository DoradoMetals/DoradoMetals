// Writes on shipping.pickups, against real Postgres. Self-contained: the shipment each pickup hangs off is created in the same rolled-back transaction, so no lock applies.
import { test, afterAll, beforeAll } from "vitest";
import assert from "node:assert/strict";
import type { PoolClient } from "pg";
import { randomUUID } from "node:crypto";
import pool from "#db";
import * as pickups from "#db/shipping/pickups/repo.ts";
import * as shipments from "#db/shipping/shipments/repo.ts";

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

test("update writes a real pickup", async () => {
  await inRollback(async (c: PoolClient) => {
    const shipment_id = await shipments.create({ id: randomUUID(), direction: "Inbound" }, c);
    const row = await pickups.create(
      { id: randomUUID(), shipment_id, requested_at: null, status: "scheduled", confirmation_number: null, location: null },
      c
    );

    const changed = await pickups.update(
      row.id,
      { requested_at: "2026-01-05 10:00:00", status: "completed", confirmation_number: "42", location: "Front desk" },
      c
    );
    assert.equal(changed, true, "update reported no row changed");

    const after = await pickups.getOne(row.id, c);
    assert.equal(after?.status, "completed");
    assert.equal(after?.confirmation_number, "42");
    assert.equal(after?.location, "Front desk");
  });
});

test("update answers false for an id with no pickup row", async () => {
  await inRollback(async (c: PoolClient) => {
    const changed = await pickups.update(
      randomUUID(),
      { requested_at: null, status: "completed", confirmation_number: null, location: null },
      c
    );
    assert.equal(changed, false, "update reported a change for a pickup that does not exist");
  });
});

test("remove deletes a real pickup and answers false the second time", async () => {
  await inRollback(async (c: PoolClient) => {
    const shipment_id = await shipments.create({ id: randomUUID(), direction: "Inbound" }, c);
    const row = await pickups.create(
      { id: randomUUID(), shipment_id, requested_at: null, status: "scheduled", confirmation_number: null, location: null },
      c
    );

    const removed = await pickups.remove(row.id, c);
    assert.equal(removed, true, "remove reported no row changed");
    assert.equal(await pickups.getOne(row.id, c), undefined);

    const removedAgain = await pickups.remove(row.id, c);
    assert.equal(removedAgain, false, "remove reported a change for a pickup already gone");
  });
});
