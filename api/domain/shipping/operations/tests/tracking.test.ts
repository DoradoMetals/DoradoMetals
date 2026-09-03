// A tracking refresh that recognises nothing must not delete what is known - getTracking replaces every event for a shipment, and removeEvents is an unconditional DELETE while insertEvents no-ops on an empty response, so an unrecognised reply silently wiped a shipment's whole history and overwrote the row with parseTracking's placeholders ("Status Unknown", null estimate, null delivered_at).
// IT HAS ALREADY HAPPENED IN PRODUCTION: four shipments sit at "Status Unknown" with zero tracking events, three at "Delivered" with zero - only this function ever writes those two statuses, so all seven had events when marked and don't now.
// NOTHING IS COMMITTED, and the first version of this file committed everything: it opened its own transaction while the service under test opened its own, on a different connection, so the service's writes committed while the test's rolled back - deleting five dev shipments' real history and replacing it with fake data, the exact bug this file exists to prevent.
// shared/testing/pinned-pool.ts fixes that and is not optional: it makes pool.connect/pool.query hand back the same client, so the service's BEGIN/COMMIT become savepoints inside one outer transaction the last test proves gets discarded.
// The fixture is self-seeded, not picked from dev, and the expected timestamp is computed through the same ::timestamptz cast the write uses - not a hardcoded UTC literal, since the session's TimeZone isn't always UTC.
// Nothing calls FedEx: getTracking takes an optional fetchTracking the way sendEmail takes a transport, and these pass one.
import test, { after } from "node:test";
import assert from "node:assert/strict";
import type { PoolClient } from "pg";
import pool from "#db";
import query from "#shared/db/query.ts";
import * as service from "#domain/shipping/operations/service.ts";
import { LOCKS } from "#shared/testing/locks.ts";
import { inPinnedTransaction, assertNothingEscaped } from "#shared/testing/pinned-pool.ts";

type ShipmentRow = { shipping_status: string | null; delivered_at: Date | null; estimated_delivery: Date | null };

// The two shipments this file creates, so the closing test can prove neither survived the rollback - checked by id.
let firstShipmentId: string | undefined;
let secondShipmentId: string | undefined;

after(async () => {
  await pool.end();
});

// No executor argument: inside inPinnedTransaction these run on the same pinned connection the service uses, so they see its uncommitted writes.
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

// A bare shipment with two tracking events, on the pinned client so it lives and dies with the transaction. Every omitted column is nullable or defaulted - getTracking's read composes a shipment via left joins, needing no carrier, package or order.
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

// Exactly what parseTracking returns when it recognised nothing: an empty
// scanEvents array and its two placeholder strings.
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

    // `async` because FetchTracking returns a Promise - awaiting a plain value works the same at runtime.
    await service.getTracking(shipment.id, async () => recognisedNothing());

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
  }, { lock: LOCKS.ORDERS });
});

// The guard must not disable tracking: refusing every write would pass the test above too, so this proves a response that DOES recognise something still replaces the events and status.
test("a refresh that recognises something still replaces what is stored", async () => {
  await inPinnedTransaction(async (client) => {
    const shipment = await seedShipment(client);
    secondShipmentId = shipment.id;

    // The expected instant, resolved by the SAME cast the write goes through - not a hardcoded UTC literal, since the session's TimeZone isn't always UTC.
    const { rows: [{ expected }] } = await client.query<{ expected: Date }>(
      `SELECT '2026-09-01T12:00:00'::timestamptz AS expected`
    );

    await service.getTracking(shipment.id, async () => ({
      estimatedDeliveryTime: "2026-09-01T12:00:00",
      // Two different locations on purpose: identical rows would let the
      // assertion below pass on ordering it never checked.
      scanEvents: [
        { date: "2026-08-20T09:00:00", location: "Memphis, TN", status: "In Transit" },
        { date: "2026-08-21T09:00:00", location: "Dallas, TX", status: "Dropped Off" },
      ],
      latestStatus: "Dropped Off",
      deliveredAt: null,
    }));

    // Asserted by identity, not count: "there are two events" is a coincidence the fixture can satisfy alone; "these are the two this test supplied, and the old ones are gone" is the property.
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
  }, { lock: LOCKS.ORDERS });
});

// The property the pin exists for: every assertion above reads its own writes and passes either way if the pin breaks - this is the one that notices.
// Checked by id, not a baseline count: dev already holds rows a prior bug committed, so a bare count would be thrown off by data this file didn't write; a fresh id per run is airtight regardless.
test("nothing this file did survived the transaction", async () => {
  for (const id of [firstShipmentId, secondShipmentId]) {
    assert.ok(id, "a prior test did not record the shipment id it created");
    const shipments = await assertNothingEscaped("shipping.shipments", "id = $1", [id]);
    assert.equal(shipments, 0, `a shipment this file created (${id}) was committed`);
    const events = await assertNothingEscaped("shipping.tracking", "shipment_id = $1", [id]);
    assert.equal(events, 0, `tracking events for a shipment this file created (${id}) were committed`);
  }
});
