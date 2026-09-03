// The writes on shipping.shipments, against real Postgres.
//
// Self-contained: every shipment this file touches is created inside the
// same rolled-back transaction.
import test, { after, before } from "node:test";
import assert from "node:assert/strict";
import type { PoolClient } from "pg";
import { randomUUID } from "node:crypto";
import pool from "#db";
import * as shipments from "#db/shipping/shipments/repo.ts";

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

test("update replaces the row - everything the carrier told us, in one write", async () => {
  await inRollback(async (c: PoolClient) => {
    const id = await shipments.create({ id: randomUUID(), direction: "Inbound" }, c);

    const changed = await shipments.update(id, {
      tracking_number: "1Z999",
      shipping_status: "Label Created",
      direction: "Inbound",
      insured: true,
      declared_value: 500,
      cost: 12.5,
    }, c);
    assert.equal(changed, true, "update reported no row changed");

    const row = await shipments.getOne(id, c);
    assert.equal(row?.tracking_number, "1Z999");
    assert.equal(row?.shipping_status, "Label Created");
    assert.equal(row?.insured, true);
    assert.equal(Number(row?.declared_value), 500);
  });
});

test("update answers false for an id with no shipment row", async () => {
  await inRollback(async (c: PoolClient) => {
    const changed = await shipments.update(randomUUID(), { direction: "Inbound" }, c);
    assert.equal(changed, false, "update reported a change for a shipment that does not exist");
  });
});

test("remove deletes a real shipment and answers false the second time", async () => {
  await inRollback(async (c: PoolClient) => {
    const id = await shipments.create({ id: randomUUID(), direction: "Inbound" }, c);

    const removed = await shipments.remove(id, c);
    assert.equal(removed, true, "remove reported no row changed");
    assert.equal(await shipments.getOne(id, c), undefined);

    const removedAgain = await shipments.remove(id, c);
    assert.equal(removedAgain, false, "remove reported a change for a shipment already gone");
  });
});
