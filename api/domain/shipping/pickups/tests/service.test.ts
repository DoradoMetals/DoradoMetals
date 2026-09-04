// Carrier pickup writes, against real Postgres - native shipping.pickups. Each test runs inside a rolled-back transaction.
// create()/remove() and the order-resolving fabrication path they backed are
// gone from the service (D214 item 11: no production caller ever used them,
// and the fallback FABRICATED a row that had not been written). The live
// booking path is recordForShipment(), handed the shipment it hangs off
// directly - so these tests book against a bare shipment rather than
// resolving one through an order.
import { test, afterAll, beforeAll } from "vitest";
import assert from "node:assert/strict";
import type { PoolClient } from "pg";
import pool from "#pool";
import { inRollback } from "#shared/testing/rollback.ts";
import * as pickupService from "#domain/shipping/pickups/service.ts";
import * as shipmentService from "#domain/shipping/shipments/service.ts";


beforeAll(async () => {
  assert.equal(
    new Date().getTimezoneOffset(), 0,
    "these tests require TZ=UTC - run them with `pnpm --filter @dorado/api test`"
  );
});

afterAll(async () => {
  await pool.end();
});

// A bare shipment, so a pickup has somewhere to hang - no order needed, since
// recordForShipment takes the shipment id directly.
const aBareShipment = async (c: PoolClient) => {
  const shipment = await shipmentService.create({ direction: "Outbound" }, c);
  assert.ok(shipment, "fixture: the shipment shell was not created");
  return shipment;
};

const aBooking = (over = {}) => ({
  date: "2026-08-22",
  time: "10:30:00",
  confirmation_number: 998877,
  location: "FRONT",
  ...over,
});

test("recording a pickup for a shipment creates the row", async () => {
  await inRollback(async (c: PoolClient) => {
    const shipment = await aBareShipment(c);
    const created = await pickupService.recordForShipment(
      { shipment_id: shipment.id, ...aBooking() }, c
    );
    assert.ok(created?.id, "recordForShipment returned nothing");
    assert.equal(created.location, "FRONT");
    assert.equal(created.status, "scheduled");
    assert.equal(created.shipment_id, shipment.id);
  });
});

// Date/time arrive separately (as FedEx wants them) and combine in Postgres - a JS Date here would carry the process timezone into a `timestamp without time zone` column.
test("the date and time are combined into requested_at", async () => {
  await inRollback(async (c: PoolClient) => {
    const shipment = await aBareShipment(c);
    const created = await pickupService.recordForShipment(
      { shipment_id: shipment.id, ...aBooking({ date: "2026-08-22", time: "10:30:00" }) }, c
    );
    const { rows: [row] } = await c.query(
      "SELECT to_char(requested_at, 'YYYY-MM-DD HH24:MI:SS') AS at FROM shipping.pickups WHERE id = $1",
      [created.id]
    );
    assert.equal(row.at, "2026-08-22 10:30:00");
  });
});

test("a pickup with no time still records the date at midnight", async () => {
  await inRollback(async (c: PoolClient) => {
    const shipment = await aBareShipment(c);
    const created = await pickupService.recordForShipment(
      { shipment_id: shipment.id, ...aBooking({ time: "" }) }, c
    );
    const { rows: [row] } = await c.query(
      "SELECT to_char(requested_at, 'YYYY-MM-DD HH24:MI:SS') AS at FROM shipping.pickups WHERE id = $1",
      [created.id]
    );
    assert.equal(row.at, "2026-08-22 00:00:00");
  });
});

// update() is a FULL REPLACE (the repo's UPDATE is not a COALESCE patch), so
// the caller passes every column back - status is the only one changing.
test("updating a pickup records the new status rather than the old one", async () => {
  await inRollback(async (c: PoolClient) => {
    const shipment = await aBareShipment(c);
    const created = await pickupService.recordForShipment(
      { shipment_id: shipment.id, ...aBooking() }, c
    );
    const updated = await pickupService.update(created.id, {
      requested_at: created.requested_at,
      status: "canceled",
      confirmation_number: created.confirmation_number,
      location: created.location,
    }, c);
    assert.ok(updated, "the update returned no pickup");
    assert.equal(updated.status, "canceled");
  });
});

// Status vocabulary is enforced by a CHECK constraint; the cancel path once used the British spelling - pinned here so the two can't drift apart silently.
test("the status vocabulary is pending / scheduled / completed / canceled", async () => {
  await inRollback(async (c: PoolClient) => {
    const shipment = await aBareShipment(c);
    const created = await pickupService.recordForShipment(
      { shipment_id: shipment.id, ...aBooking() }, c
    );
    for (const status of ["pending", "scheduled", "completed", "canceled"]) {
      const updated = await pickupService.update(created.id, {
        requested_at: created.requested_at,
        status,
        confirmation_number: created.confirmation_number,
        location: created.location,
      }, c);
      assert.ok(updated, "the pickup could not be updated");
      assert.equal(updated.status, status);
    }
    await assert.rejects(
      () => pickupService.update(created.id, {
        requested_at: created.requested_at,
        status: "cancelled",
        confirmation_number: created.confirmation_number,
        location: created.location,
      }, c),
      (err: unknown) => (err as Record<string, unknown>).code === "23514",
      "the double-l spelling was accepted; the cancel path would silently work"
    );
  });
});

// The shape is the row - compared against shipping.pickups' own column list.
test("the pickup has exactly the columns shipping.pickups has", async () => {
  await inRollback(async (c: PoolClient) => {
    const shipment = await aBareShipment(c);
    const created = await pickupService.recordForShipment(
      { shipment_id: shipment.id, ...aBooking() }, c
    );

    const { rows: contract } = await c.query(
      `SELECT column_name FROM information_schema.columns
        WHERE table_schema = 'shipping' AND table_name = 'pickups'`
    );
    const fromService = await pickupService.getById(created.id, c);
    assert.ok(fromService, "the pickup did not come back");

    assert.deepEqual(
      Object.keys(fromService).sort(),
      contract.map((r) => r.column_name).sort(),
      "the row has drifted from shipping.pickups' own columns"
    );
    assert.equal(Number(fromService.confirmation_number), 998877);
    assert.ok(fromService.shipment_id, "the pickup did not link to a shipment");
  });
});
