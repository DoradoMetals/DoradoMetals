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

const aBareShipment = async (c: PoolClient) => {
  const shipment = await shipmentService.create(null, "Outbound", c);
  assert.ok(shipment, "fixture: the shipment shell was not created");
  return shipment;
};

const aBooking = (over: { date?: string; time?: string } = {}) => ({
  date: "2026-08-22", time: "10:30:00", ...over,
});

const record = (
  shipment_id: string, over: { date?: string; time?: string }, c: PoolClient
) => {
  const booking = aBooking(over);
  return pickupService.recordForShipment(
    shipment_id, booking.date, booking.time, 998877, "FRONT", c
  );
};

test("recording a pickup for a shipment creates the row", async () => {
  await inRollback(async (c: PoolClient) => {
    const shipment = await aBareShipment(c);
    const created = await record(shipment.id, {}, c);
    assert.ok(created?.id, "recordForShipment returned nothing");
    assert.equal(created.location, "FRONT");
    assert.equal(created.status, "scheduled");
    assert.equal(created.shipment_id, shipment.id);
  });
});

test("the date and time are combined into requested_at", async () => {
  await inRollback(async (c: PoolClient) => {
    const shipment = await aBareShipment(c);
    const created = await record(shipment.id, { date: "2026-08-22", time: "10:30:00" }, c);
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
    const created = await record(shipment.id, { time: "" }, c);
    const { rows: [row] } = await c.query(
      "SELECT to_char(requested_at, 'YYYY-MM-DD HH24:MI:SS') AS at FROM shipping.pickups WHERE id = $1",
      [created.id]
    );
    assert.equal(row.at, "2026-08-22 00:00:00");
  });
});

test("updating a pickup records the new status rather than the old one", async () => {
  await inRollback(async (c: PoolClient) => {
    const shipment = await aBareShipment(c);
    const created = await record(shipment.id, {}, c);
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

test("the status vocabulary is pending / scheduled / completed / canceled", async () => {
  await inRollback(async (c: PoolClient) => {
    const shipment = await aBareShipment(c);
    const created = await record(shipment.id, {}, c);
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

test("the pickup has exactly the columns shipping.pickups has", async () => {
  await inRollback(async (c: PoolClient) => {
    const shipment = await aBareShipment(c);
    const created = await record(shipment.id, {}, c);

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
