import { test, afterAll } from "vitest";
import assert from "node:assert/strict";
import type { PoolClient } from "pg";
import pool from "#pool";
import query from "#shared/db/query.ts";
import * as service from "#domain/shipping/operations/service.ts";
import { LOCKS } from "#shared/testing/locks.ts";
import { TEST_ACTOR } from "#shared/testing/actor.ts";
import { inPinnedTransaction, assertNothingEscaped } from "#shared/testing/pinned-pool.ts";

type ShipmentRow = { shipping_status: string | null; delivered_at: Date | null; estimated_delivery: Date | null };

let firstShipmentId: string | undefined;
let secondShipmentId: string | undefined;

afterAll(async () => {
  await pool.end();
});

const eventCount = async (id: string): Promise<number> => {
  const { rows } = await query(
    `SELECT count(*)::int AS n FROM shipping.tracking WHERE shipment_id = $1`,
    [id]
  );
  return rows[0].n;
};

const shipmentRow = async (id: string): Promise<ShipmentRow> => {
  const { rows } = await query<ShipmentRow>(
    `SELECT shipping_status, delivered_at, est_delivery AS estimated_delivery
       FROM shipping.shipments WHERE id = $1`,
    [id]
  );
  return rows[0];
};

async function seedShipment(client: PoolClient): Promise<{ id: string }> {
  const { rows: [shipment] } = await client.query(
    `INSERT INTO shipping.shipments (shipping_status, est_delivery)
     VALUES ('In Transit', '2026-08-25T00:00:00Z')
     RETURNING id`
  );
  await client.query(
    `INSERT INTO shipping.tracking (shipment_id, status, location, time)
     VALUES
       ($1, 'Label Created', 'Reno, NV', '2026-08-19T09:00:00Z'),
       ($1, 'In Transit',    'Reno, NV', '2026-08-20T09:00:00Z')`,
    [shipment.id]
  );
  return shipment;
}

const recognisedNothing = () => ({
  estimatedDeliveryTime: "TBD",
  scanEvents: [],
  latestStatus: "Status Unknown",
  deliveredAt: null,
});

test("a refresh that recognises nothing leaves the events and the status alone", async () => {
  await inPinnedTransaction(async (client) => {
    const shipment = await seedShipment(client);
    firstShipmentId = shipment.id;

    const before = {
      events: await eventCount(shipment.id),
      row: await shipmentRow(shipment.id),
    };
    assert.equal(before.events, 2, "the seeded shipment did not keep its events");

    await service.getTracking(shipment.id, true, async () => recognisedNothing());

    assert.equal(
      await eventCount(shipment.id),
      before.events,
      "an empty tracking response deleted the shipment's history"
    );
    assert.deepEqual(
      await shipmentRow(shipment.id),
      before.row,
      "an empty tracking response overwrote the status, the estimate or the delivery date"
    );
  }, { actor: TEST_ACTOR.id, lock: LOCKS.ORDERS });
});

test("a refresh that recognises something still replaces what is stored", async () => {
  await inPinnedTransaction(async (client) => {
    const shipment = await seedShipment(client);
    secondShipmentId = shipment.id;

    const { rows: [{ expected }] } = await client.query<{ expected: Date }>(
      `SELECT '2026-09-01T12:00:00'::timestamptz AS expected`
    );

    await service.getTracking(shipment.id, true, async () => ({
      estimatedDeliveryTime: "2026-09-01T12:00:00",
      scanEvents: [
        { date: "2026-08-20T09:00:00", location: "Memphis, TN", status: "In Transit" },
        { date: "2026-08-21T09:00:00", location: "Dallas, TX", status: "Dropped Off" },
      ],
      latestStatus: "Dropped Off",
      deliveredAt: null,
    }));

    const { rows: events } = await client.query(
      `SELECT status, location FROM shipping.tracking
        WHERE shipment_id = $1 ORDER BY time ASC`,
      [shipment.id]
    );
    assert.deepEqual(
      events,
      [
        { status: "In Transit", location: "Memphis, TN" },
        { status: "Dropped Off", location: "Dallas, TX" },
      ],
      "the recognised events did not replace what was stored"
    );

    const after = await shipmentRow(shipment.id);
    assert.equal(after.shipping_status, "Dropped Off", "the status was not updated");
    assert.equal(
      after.estimated_delivery?.toISOString?.(),
      expected.toISOString(),
      "the estimate was not updated"
    );
  }, { actor: TEST_ACTOR.id, lock: LOCKS.ORDERS });
});

test("nothing this file did survived the transaction", async () => {
  for (const id of [firstShipmentId, secondShipmentId]) {
    assert.ok(id, "a prior test did not record the shipment id it created");
    const shipments = await assertNothingEscaped("shipping.shipments", "id = $1", [id]);
    assert.equal(shipments, 0, `a shipment this file created (${id}) was committed`);
    const events = await assertNothingEscaped("shipping.tracking", "shipment_id = $1", [id]);
    assert.equal(events, 0, `tracking events for a shipment this file created (${id}) were committed`);
  }
});
