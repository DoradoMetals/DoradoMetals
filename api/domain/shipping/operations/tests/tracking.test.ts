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
// THE FIXTURE IS SELF-SEEDED NOW (2026-09-03). The earlier version picked
// "the shipment with the most tracking events" out of dev, which coupled this
// file to whatever dev happened to hold - and its second test compared the
// written estimate against a hardcoded UTC literal, which silently assumed the
// database session's TimeZone is UTC. It is not, on every cluster this suite
// now runs against: the local Postgres `pnpm --filter @dorado/api test` uses reports
// `America/Chicago`, five hours off, because `estimatedDeliveryTime` arrives as
// a bare string with no offset and Postgres resolves it against the session's
// own TimeZone. Seeding a fresh shipment fixes the coupling; computing the
// expected instant with the same `::timestamptz` cast the write goes through
// fixes the timezone assumption, and the fix does not depend on which zone the
// cluster happens to be in.
//
// Nothing calls FedEx either: getTracking takes an optional fetchTracking the
// way sendEmail takes a transport, and these pass one.
import test, { after } from "node:test";
import assert from "node:assert/strict";
import type { PoolClient } from "pg";
import pool from "#db";
import query from "#shared/db/query.ts";
import * as service from "#domain/shipping/operations/service.ts";
import { LOCKS } from "#shared/testing/locks.ts";
import { inPinnedTransaction, assertNothingEscaped } from "#shared/testing/pinned-pool.ts";

type ShipmentRow = { shipping_status: string | null; delivered_at: Date | null; estimated_delivery: Date | null };

// The two shipments this file creates, so the closing test can prove neither
// survived the rollback - by id, rather than by a location string that used
// to be tied to a specific dev row.
let firstShipmentId: string | undefined;
let secondShipmentId: string | undefined;

after(async () => {
  await pool.end();
});

// No executor argument: inside inPinnedTransaction these run on the pinned
// connection, which is the same one the service is using, so they see its
// uncommitted writes - and neither survives the rollback.
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

// A bare shipment with two tracking events, inserted on the pinned client so
// it lives and dies with the transaction the caller holds. Every column left
// out is nullable or has a default (direction, insured) - nothing here needs a
// carrier, a package or an order, because getTracking's read path composes a
// shipment with none of those through left joins.
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

    // `async` because FetchTracking is declared `=> Promise<ParsedTracking>`
    // and this stub returned the object bare. Awaiting a value and awaiting a
    // promise of it are the same thing at runtime, so the test is unchanged.
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

// AND THE GUARD MUST NOT DISABLE TRACKING. Refusing every write would pass the
// test above, so this proves a response that DOES recognise something still
// replaces the events and the status - which is also what proves the
// assertions above can see a change at all.
test("a refresh that recognises something still replaces what is stored", async () => {
  await inPinnedTransaction(async (client) => {
    const shipment = await seedShipment(client);
    secondShipmentId = shipment.id;

    // The expected instant, resolved by the SAME cast the write below goes
    // through - not a hardcoded UTC literal. A literal comparison only holds
    // while the database session's TimeZone happens to be UTC, and it is not
    // on every cluster this suite runs against.
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

    // Asserted by identity rather than by count. "There are two events" is a
    // coincidence the fixture can satisfy on its own; "the two events are the
    // ones this test supplied, and the ones it had are gone" is the property.
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

// The property the pin exists for. Every assertion above reads its own writes
// and passes either way if the pin stops working; this is the one that notices.
//
// Checked by id rather than against a baseline count. The earlier version
// measured a location/status literal against a count taken before the suite
// ran, because dev already held rows a prior bug had committed and a bare
// zero would have failed on data this file did not write. Seeded shipments get
// a fresh id every run, so "this file's shipment does not exist" is airtight
// regardless of what else the table holds.
test("nothing this file did survived the transaction", async () => {
  for (const id of [firstShipmentId, secondShipmentId]) {
    assert.ok(id, "a prior test did not record the shipment id it created");
    const shipments = await assertNothingEscaped("shipping.shipments", "id = $1", [id]);
    assert.equal(shipments, 0, `a shipment this file created (${id}) was committed`);
    const events = await assertNothingEscaped("shipping.tracking", "shipment_id = $1", [id]);
    assert.equal(events, 0, `tracking events for a shipment this file created (${id}) were committed`);
  }
});
