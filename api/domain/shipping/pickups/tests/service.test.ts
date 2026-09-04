// Carrier pickup writes, against real Postgres - native shipping.pickups. Each test runs inside a rolled-back transaction.
// The first test guards a production bug: create() named a column the table lacked (42703) - it threw after FedEx had already booked a real pickup, leaving nothing pointing at it.
import { test, afterAll, beforeAll } from "vitest";
import assert from "node:assert/strict";
import type { PoolClient } from "pg";
import pool from "#pool";
import { LOCKS, takeLocks } from "#shared/testing/locks.ts";
import { rollbackIn } from "#shared/testing/rollback.ts";
import * as dual from "#domain/shipping/pickups/service.ts";


beforeAll(async () => {
  assert.equal(
    new Date().getTimezoneOffset(), 0,
    "these tests require TZ=UTC - run them with `pnpm --filter @dorado/api test`"
  );
});

afterAll(async () => {
  await pool.end();
});

// LOCKS.ORDERS + LOCKS.FULFILLMENTS, transaction-scoped (lane 3, the runner
// conversion): this file picks a purchase order off orders.orders and
// deletes fulfillments.shipments rows, and
// domain/orders/tests/edit-line.test.ts writes real, autocommitting rows to
// orders.orders under LOCKS.ORDERS - see purchase-read.test.ts's own comment
// for the full mechanism.
// THE FILE'S LOCK, BOUND ONCE. A lock is a property of what this file
// WRITES, not of one call, so it is named here and every inRollback below
// inherits it - which is also what stops a new test being added without one.
const inRollback = rollbackIn({ lock: [LOCKS.ORDERS, LOCKS.FULFILLMENTS] });

// A purchase order with a shipment already on it, so a pickup has somewhere to hang.
const anOrderWithShipment = async (c: PoolClient) => {
  const { rows } = await c.query(
    `SELECT f.order_id
       FROM shipping.shipments ss
       JOIN fulfillments.shipments fs ON fs.shipment_id = ss.id
       JOIN fulfillments.fulfillments f ON f.id = fs.fulfillment_id
       JOIN orders.orders o ON o.id = f.order_id
      WHERE o.direction = 'purchase'
      ORDER BY ss.id ASC
      LIMIT 1`
  );
  return rows[0]?.order_id ?? null;
};

const aPickup = (over = {}) => ({
  carrier: "FedEx",
  date: "2026-08-22",
  time: "10:30:00",
  pickup_status: "scheduled",
  confirmation_number: 998877,
  location: "FRONT",
  ...over,
});

test("creating a pickup no longer dies on the missing shipment_id column", async () => {
  await inRollback(async (c: PoolClient) => {
    const created = await dual.create(aPickup(), c);
    assert.ok(created, "the pickup was not created");
    assert.ok(created?.id, "create returned nothing");
    assert.equal(created.location, "FRONT");
    assert.equal(created.status, "scheduled");
  });
});

// Date/time arrive separately (as FedEx wants them) and combine in Postgres - a JS Date here would carry the process timezone into a `timestamp without time zone` column.
test("the date and time are combined into pickup_requested_at", async () => {
  await inRollback(async (c: PoolClient) => {
    // The row is only written when the order resolves a shipment - the fixture needs a real order.
    const order_id = await anOrderWithShipment(c);
    assert.ok(order_id, "dev has no order with a shipment");
    const created = await dual.create(aPickup({ order_id, date: "2026-08-22", time: "10:30:00" }), c);
    assert.ok(created, "the pickup was not created");
    const { rows: [row] } = await c.query(
      "SELECT to_char(requested_at, 'YYYY-MM-DD HH24:MI:SS') AS at FROM shipping.pickups WHERE id = $1",
      [created.id]
    );
    assert.equal(row.at, "2026-08-22 10:30:00");
  });
});

test("a pickup with no time still records the date at midnight", async () => {
  await inRollback(async (c: PoolClient) => {
    const order_id = await anOrderWithShipment(c);
    assert.ok(order_id, "dev has no order with a shipment");
    const created = await dual.create(aPickup({ order_id, time: null }), c);
    assert.ok(created, "the pickup was not created");
    const { rows: [row] } = await c.query(
      "SELECT to_char(requested_at, 'YYYY-MM-DD HH24:MI:SS') AS at FROM shipping.pickups WHERE id = $1",
      [created.id]
    );
    assert.equal(row.at, "2026-08-22 00:00:00");
  });
});

test("a pickup is mirrored onto the order's shipment", async () => {
  await inRollback(async (c: PoolClient) => {
    const order_id = await anOrderWithShipment(c);
    if (!order_id) return;

    const created = await dual.create(aPickup({ order_id }), c);
    assert.ok(created, "the pickup was not created");

    const { rows } = await c.query(
      `SELECT p.shipment_id, f.order_id
       FROM shipping.pickups p
       JOIN fulfillments.shipments fs ON fs.shipment_id = p.shipment_id
       JOIN fulfillments.fulfillments f ON f.id = fs.fulfillment_id
       WHERE p.id = $1`,
      [created.id]
    );
    assert.equal(rows.length, 1, "the pickup did not land on a shipment");
    assert.equal(rows[0].order_id, order_id, "it hung off the wrong order's shipment");
  });
});

// The mirror must not take the caller's transaction down when there is no
// shipment to point at - that is the failure mode that broke purchase orders.
test("a pickup whose order has no shipment mirrors nothing and does not throw", async () => {
  await inRollback(async (c: PoolClient) => {
    // Manufactures its own shipment-less order rather than searching for one: searching was VACUOUS (dev has none, so it passed without testing anything) or FLAKY (a race made the selected row vanish before the insert).
    // Shipments are deleted inside the rolled-back transaction, so nothing survives the test - same approach as domain/orders/tests/create.test.ts.
    const { rows } = await c.query(
      `SELECT o.id FROM orders.orders o WHERE o.direction = 'purchase'
        ORDER BY o.created_at ASC, o.id ASC LIMIT 1`
    );
    const order_id = rows[0]?.id ?? null;
    assert.ok(order_id, "dev has no purchase order at all");

    // The link is what has to go: shipping.pickups.shipment_id is a foreign key into shipping.shipments, resolved through the order's fulfillment.
    await c.query(
      `DELETE FROM fulfillments.shipments fs
        USING fulfillments.fulfillments f
        WHERE f.id = fs.fulfillment_id AND f.order_id = $1`,
      [order_id]
    );

    const { rows: left } = await c.query(
      `SELECT count(*)::int AS n
         FROM fulfillments.shipments fs
         JOIN fulfillments.fulfillments f ON f.id = fs.fulfillment_id
        WHERE f.order_id = $1`,
      [order_id]
    );
    assert.equal(left[0].n, 0, "the order still has a shipment, so this proves nothing");

    const created = await dual.create(aPickup({ order_id }), c);
    assert.ok(created, "the pickup was not created");
    assert.ok(created?.id, "the pickup was not recorded");

    const mirrored = await c.query("SELECT 1 FROM shipping.pickups WHERE id = $1", [created.id]);
    assert.equal(mirrored.rows.length, 0, "a pickup was mirrored with no shipment to hang off");
  });
});

test("updating a pickup records the new status rather than the old one", async () => {
  await inRollback(async (c: PoolClient) => {
    const created = await dual.create(aPickup(), c);
    assert.ok(created, "the pickup was not created");
    const updated = await dual.update({ id: created.id, pickup_status: "canceled" }, c);
    assert.ok(updated, "the update returned no pickup");
    assert.equal(updated.status, "canceled");
  });
});

// Status vocabulary is enforced by a CHECK constraint; the cancel path once used the British spelling - pinned here so the two can't drift apart silently.
test("the status vocabulary is pending / scheduled / completed / canceled", async () => {
  await inRollback(async (c: PoolClient) => {
    const order_id = await anOrderWithShipment(c);
    assert.ok(order_id, "dev has no order with a shipment");
    for (const status of ["pending", "scheduled", "completed", "canceled"]) {
      const row = await dual.create(aPickup({ order_id, pickup_status: status }), c);
      assert.ok(row, "the pickup could not be read back");
      assert.equal(row.status, status);
    }
    await assert.rejects(
      () => dual.create(aPickup({ order_id, pickup_status: "cancelled" }), c),
      (err: unknown) => (err as Record<string, unknown>).code === "23514",
      "the double-l spelling was accepted; the cancel path would silently work"
    );
  });
});

// The shape is the row - compared against shipping.pickups' own column list, not exchange's.
test("the pickup has exactly the columns shipping.pickups has", async () => {
  await inRollback(async (c: PoolClient) => {
    const order_id = await anOrderWithShipment(c);
    assert.ok(order_id, "dev has no order with a shipment");
    const created = await dual.create(aPickup({ order_id }), c);
    assert.ok(created, "the pickup was not created");

    const { rows: contract } = await c.query(
      `SELECT column_name FROM information_schema.columns
        WHERE table_schema = 'shipping' AND table_name = 'pickups'`
    );
    const fromNext = await dual.getById(created.id, c);
    assert.ok(fromNext, "the pickup did not come back");

    assert.deepEqual(
      Object.keys(fromNext).sort(),
      contract.map((r) => r.column_name).sort(),
      "the row has drifted from shipping.pickups' own columns"
    );
    assert.equal(Number(fromNext.confirmation_number), 998877);
    assert.ok(fromNext.shipment_id, "the pickup did not link to a shipment");
  });
});
