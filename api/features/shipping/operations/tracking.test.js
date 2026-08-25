// A tracking refresh that recognises nothing must not delete what is known.
//
// getTracking removed every tracking event for a shipment and re-inserted what
// FedEx just returned. insertEvents returns 0 without inserting when there is
// nothing to insert, and removeEvents is an unconditional DELETE, so a response
// whose scan events are all of types FEDEX_TRACKING_STATUS_MAP does not name -
// or which carries none - deleted the shipment's whole history and put nothing
// back. The update that follows then wrote parseTracking's own placeholders
// over the row: "Status Unknown" as the status (a string, so the `??` never
// caught it), null for the estimate via "TBD", and null for delivered_at.
//
// IT HAS ALREADY HAPPENED IN PRODUCTION. Four shipments sit at "Status Unknown"
// with zero tracking events, and three at "Delivered" with zero. Only this
// function ever writes either of those statuses - everything else writes
// "Label Created" or "Cancelled" - so the three delivered ones had scan events
// when they were marked delivered and have none now.
//
// Nothing is committed: every query runs inside a transaction that is rolled
// back. Nothing calls FedEx: getTracking takes an optional fetchTracking the
// way sendEmail takes a transport, and these pass one.
import test, { after, before } from "node:test";
import assert from "node:assert/strict";
import pool from "#db";
import query from "#shared/db/query.js";
import withTransaction from "#shared/db/withTransaction.js";
import * as service from "#features/shipping/operations/service.js";
import { LOCKS, takeLocks } from "#shared/testing/locks.js";

let fixture;

before(async () => {
  const { rows } = await query(
    `SELECT s.id, s.shipping_status, s.delivered_at, s.estimated_delivery,
            count(e.id)::int AS events
       FROM exchange.shipments s
       JOIN exchange.tracking_events e ON e.shipment_id = s.id
      GROUP BY s.id, s.shipping_status, s.delivered_at, s.estimated_delivery
      ORDER BY count(e.id) DESC
      LIMIT 1`
  );
  fixture = rows[0];
  assert.ok(fixture, "dev has no shipment with tracking events to protect");
  assert.ok(fixture.events > 0, "the fixture has no events, so this proves nothing");
});

after(async () => {
  await pool.end();
});

const eventCount = async (client, id) => {
  const { rows } = await query(
    `SELECT count(*)::int AS n FROM exchange.tracking_events WHERE shipment_id = $1`,
    [id],
    client
  );
  return rows[0].n;
};

const shipmentRow = async (client, id) => {
  const { rows } = await query(
    `SELECT shipping_status, delivered_at, estimated_delivery
       FROM exchange.shipments WHERE id = $1`,
    [id],
    client
  );
  return rows[0];
};

// Exactly what parseTracking returns when it recognised nothing: an empty
// scanEvents array and its two placeholder strings.
const recognisedNothing = () => ({
  estimatedDeliveryTime: "TBD",
  scanEvents: [],
  latestStatus: "Status Unknown",
  deliveredAt: null,
});

test("a refresh that recognises nothing leaves the events and the status alone", async () => {
  await withTransaction(async (client) => {
    await takeLocks(client, [LOCKS.ORDERS]);
    const before = {
      events: await eventCount(client, fixture.id),
      row: await shipmentRow(client, fixture.id),
    };
    assert.ok(before.events > 0, "the fixture lost its events before the test ran");

    await service.getTracking(fixture.id, () => recognisedNothing());

    assert.equal(
      await eventCount(client, fixture.id),
      before.events,
      "an empty tracking response deleted the shipment's history"
    );
    assert.deepEqual(
      await shipmentRow(client, fixture.id),
      before.row,
      "an empty tracking response overwrote the status, the estimate or the delivery date"
    );

    throw new Error("rollback");
  }).catch((err) => {
    if (err.message !== "rollback") throw err;
  });
});

// AND THE GUARD MUST NOT DISABLE TRACKING. Refusing every write would pass the
// test above, so this proves a response that DOES recognise something still
// replaces the events and the status - which is also what proves the
// assertions above can see a change at all.
test("a refresh that recognises something still replaces what is stored", async () => {
  await withTransaction(async (client) => {
    await takeLocks(client, [LOCKS.ORDERS]);
    const before = {
      events: await eventCount(client, fixture.id),
      row: await shipmentRow(client, fixture.id),
    };

    await service.getTracking(fixture.id, () => ({
      estimatedDeliveryTime: "2026-09-01T12:00:00",
      scanEvents: [
        { date: "2026-08-20T09:00:00", location: "Dallas, TX", status: "In Transit" },
        { date: "2026-08-21T09:00:00", location: "Dallas, TX", status: "Dropped Off" },
      ],
      latestStatus: "Dropped Off",
      deliveredAt: null,
    }));

    assert.equal(
      await eventCount(client, fixture.id),
      2,
      "the recognised events did not replace what was stored"
    );
    const after = await shipmentRow(client, fixture.id);
    assert.equal(after.shipping_status, "Dropped Off", "the status was not updated");
    assert.notDeepEqual(after, before.row, "nothing about the shipment changed");

    throw new Error("rollback");
  }).catch((err) => {
    if (err.message !== "rollback") throw err;
  });
});
