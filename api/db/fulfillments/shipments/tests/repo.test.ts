// The write on fulfillments.shipments (the LINK, not the parcel), against
// real Postgres.
//
// Self-contained: the fulfillment is a DRAFT (no order) and the shipment is
// created fresh, so this file never touches a shared row.
import test, { after, before } from "node:test";
import assert from "node:assert/strict";
import type { PoolClient } from "pg";
import { randomUUID } from "node:crypto";
import pool from "#db";
import * as shipmentLinks from "#db/fulfillments/shipments/repo.ts";
import * as fulfillments from "#db/fulfillments/repo.ts";
import * as shippingShipments from "#db/shipping/shipments/repo.ts";

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

async function aDraftFulfillment(c: PoolClient): Promise<string> {
  const { rows: [m] } = await c.query(`SELECT id FROM fulfillments.methods LIMIT 1`);
  assert.ok(m, "dev has no fulfillments.methods row");
  const draft = await fulfillments.createDraft({ id: randomUUID(), method_id: m.id, created_by_id: null }, c);
  return draft.id;
}

test("upsert links a parcel, and a second call on the same shipment moves the link", async () => {
  await inRollback(async (c: PoolClient) => {
    const fulfillment_id = await aDraftFulfillment(c);
    const shipment_id = await shippingShipments.create({ id: randomUUID(), direction: "Inbound" }, c);

    const row = await shipmentLinks.upsert({ id: randomUUID(), fulfillment_id, shipment_id }, c);
    assert.equal(row.shipment_id, shipment_id);
    assert.equal(row.fulfillment_id, fulfillment_id);

    const other_fulfillment_id = await aDraftFulfillment(c);
    const moved = await shipmentLinks.upsert(
      { id: randomUUID(), fulfillment_id: other_fulfillment_id, shipment_id }, c
    );
    assert.equal(moved.id, row.id, "the conflict target is shipment_id - a second call should update, not insert");
    assert.equal(moved.fulfillment_id, other_fulfillment_id);
  });
});

test("removeByShipment unlinks the parcel and answers false the second time", async () => {
  await inRollback(async (c: PoolClient) => {
    const fulfillment_id = await aDraftFulfillment(c);
    const shipment_id = await shippingShipments.create({ id: randomUUID(), direction: "Inbound" }, c);
    await shipmentLinks.upsert({ id: randomUUID(), fulfillment_id, shipment_id }, c);

    const removed = await shipmentLinks.removeByShipment(shipment_id, c);
    assert.equal(removed, true, "removeByShipment reported no row changed");

    const removedAgain = await shipmentLinks.removeByShipment(shipment_id, c);
    assert.equal(removedAgain, false, "removeByShipment reported a change for a link already gone");
  });
});
