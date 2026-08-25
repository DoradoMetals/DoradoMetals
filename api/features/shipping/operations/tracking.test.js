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
// NOTHING IS COMMITTED, AND THE FIRST VERSION OF THIS FILE COMMITTED
// EVERYTHING. It opened its own withTransaction and asserted through that
// client - but the service under test opens its own transaction too, on its own
// connection from the pool, so its writes went to a different transaction and
// COMMITTED while mine rolled back. It deleted the real tracking history of
// five dev shipments and replaced it with the two fake events below: exactly
// the bug this file exists to prevent, committed by the test for it.
//
// shared/testing/pinned-pool.js is what makes this safe and is not optional
// here. It replaces pool.connect and pool.query for the duration, so the
// service's own withTransaction gets the same client, and its BEGIN/COMMIT
// become savepoints inside one outer transaction that is discarded. The last
// test in this file checks from outside that nothing survived.
//
// Nothing calls FedEx either: getTracking takes an optional fetchTracking the
// way sendEmail takes a transport, and these pass one.
import test, { after, before } from "node:test";
import assert from "node:assert/strict";
import pool from "#db";
import query from "#shared/db/query.js";
import * as service from "#features/shipping/operations/service.js";
import { LOCKS } from "#shared/testing/locks.js";
import {
  inPinnedTransaction,
  assertNothingEscaped,
  outside,
} from "#shared/testing/pinned-pool.js";

let fixture;
let baseline;

before(async () => {
  const rows = await outside(
    `SELECT s.id, s.shipping_status, s.delivered_at, s.estimated_delivery,
            count(e.id)::int AS events
       FROM exchange.shipments s
       JOIN exchange.tracking_events e ON e.shipment_id = s.id
      GROUP BY s.id, s.shipping_status, s.delivered_at, s.estimated_delivery
      ORDER BY count(e.id) DESC, s.id ASC
      LIMIT 1`
  );
  fixture = rows[0];
  assert.ok(fixture, "dev has no shipment with tracking events to protect");
  assert.ok(fixture.events > 0, "the fixture has no events, so this proves nothing");

  // Counted before anything runs, so the escape check below measures what THIS
  // file added rather than what the table already held.
  baseline = {
    events: await assertNothingEscaped(
      "exchange.tracking_events",
      "location = 'Dallas, TX' AND status = 'Dropped Off'"
    ),
    shipments: await assertNothingEscaped(
      "exchange.shipments",
      "estimated_delivery = '2026-09-01T12:00:00'"
    ),
  };
});

after(async () => {
  await pool.end();
});

// No executor argument: inside inPinnedTransaction these run on the pinned
// connection, which is the same one the service is using, so they see its
// uncommitted writes - and neither survives the rollback.
const eventCount = async (id) => {
  const { rows } = await query(
    `SELECT count(*)::int AS n FROM exchange.tracking_events WHERE shipment_id = $1`,
    [id]
  );
  return rows[0].n;
};

const shipmentRow = async (id) => {
  const { rows } = await query(
    `SELECT shipping_status, delivered_at, estimated_delivery
       FROM exchange.shipments WHERE id = $1`,
    [id]
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
  await inPinnedTransaction(async () => {
    const before = {
      events: await eventCount(fixture.id),
      row: await shipmentRow(fixture.id),
    };
    assert.ok(before.events > 0, "the fixture lost its events before the test ran");

    await service.getTracking(fixture.id, () => recognisedNothing());

    assert.equal(
      await eventCount(fixture.id),
      before.events,
      "an empty tracking response deleted the shipment's history"
    );
    assert.deepEqual(
      await shipmentRow(fixture.id),
      before.row,
      "an empty tracking response overwrote the status, the estimate or the delivery date"
    );
  }, { lock: LOCKS.ORDERS });
});

// AND THE GUARD MUST NOT DISABLE TRACKING. Refusing every write would pass the
// test above, so this proves a response that DOES recognise something still
// replaces the events and the status - which is also what proves the
// assertions above can see a change at all.
test("a refresh that recognises something still replaces what is stored", async () => {
  await inPinnedTransaction(async () => {
    const before = {
      events: await eventCount(fixture.id),
      row: await shipmentRow(fixture.id),
    };

    await service.getTracking(fixture.id, () => ({
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

    // Asserted by identity rather than by count. "There are two events" is a
    // coincidence the fixture can satisfy on its own; "the two events are the
    // ones this test supplied, and the ones it had are gone" is the property.
    const { rows: events } = await query(
      `SELECT status, location FROM exchange.tracking_events
        WHERE shipment_id = $1 ORDER BY scan_time ASC`,
      [fixture.id]
    );
    assert.deepEqual(
      events,
      [
        { status: "In Transit", location: "Memphis, TN" },
        { status: "Dropped Off", location: "Dallas, TX" },
      ],
      "the recognised events did not replace what was stored"
    );

    const after = await shipmentRow(fixture.id);
    assert.equal(after.shipping_status, "Dropped Off", "the status was not updated");
    // Field by field rather than `notDeepEqual(after, before.row)`. That
    // comparison passes only when the fixture did not already happen to hold
    // these values, which is a coincidence rather than a property - and it is
    // exactly what failed once the first version of this file had committed
    // these very values onto the fixture.
    assert.equal(
      after.estimated_delivery?.toISOString?.() ?? after.estimated_delivery,
      new Date("2026-09-01T12:00:00").toISOString(),
      "the estimate was not updated"
    );
  }, { lock: LOCKS.ORDERS });
});

// The property the pin exists for. Every assertion above reads its own writes
// and passes either way if the pin stops working; this is the one that notices.
//
// Measured against a baseline taken before the tests ran, rather than against
// zero. Not a weakening: "this file added nothing" is the actual property, and
// the absolute form only worked while the table happened to be clean. It is not
// clean - the first version of this file committed these very rows onto five
// dev shipments, and until dev is repaired from production the baseline is
// where those rows are counted. If the pin ever breaks, the count grows during
// the run and this fails either way.
test("nothing this file did survived the transaction", async () => {
  const events = await assertNothingEscaped(
    "exchange.tracking_events",
    "location = 'Dallas, TX' AND status = 'Dropped Off'"
  );
  assert.equal(
    events,
    baseline.events,
    `a fabricated tracking event was committed to dev (${baseline.events} before, ${events} after)`
  );

  const shipments = await assertNothingEscaped(
    "exchange.shipments",
    "estimated_delivery = '2026-09-01T12:00:00'"
  );
  assert.equal(
    shipments,
    baseline.shipments,
    `a shipment kept the estimate this file wrote (${baseline.shipments} before, ${shipments} after)`
  );
});
