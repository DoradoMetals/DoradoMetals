// Carrier pickup writes, against real Postgres - native shipping.pickups
// since D212.
//
// The first test here is a regression test for a bug that reached production:
// create() named a column the table did not have, so every insert died on
// 42703 and no pickup was ever recorded. It threw inside the purchase-order
// transaction, after FedEx had already booked a real pickup - so the label
// write rolled back and the booking survived with nothing pointing at it.
//
// Each test runs inside a transaction that is rolled back.
import test, { after, before } from "node:test";
import assert from "node:assert/strict";
import type { PoolClient } from "pg";
import pool from "#db";
import * as dual from "#domain/shipping/pickups/service.ts";

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

// A purchase order that already has a shipment on both sides, so a pickup has
// something to hang off in the new schema.
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

// The date and time arrive separately, as FedEx wants them, and are combined in
// Postgres. A JS Date here would carry the process timezone into a `timestamp
// without time zone` column.
test("the date and time are combined into pickup_requested_at", async () => {
  await inRollback(async (c: PoolClient) => {
    // The row is only written when the order resolves a shipment (D212 -
    // shipping.pickups hangs off one), so the fixture needs a real order.
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
    // MAKES its own shipment-less order rather than hunting for one, and both
    // halves of that matter.
    //
    // VACUOUS: dev has zero orders with no shipment, so the search returned
    // nothing and the test returned early - passing without exercising a line
    // of the thing it is named for.
    //
    // FLAKY: in a full run it found one anyway and then failed the foreign key
    // on insert, which means the row it selected was not there by the time it
    // wrote. What made a row appear and vanish between two statements on one
    // connection is not explained here, and this does not pretend to explain
    // it - it removes the search, which is the part that could race.
    //
    // The shipments are deleted inside the transaction that is rolled back,
    // the same way features/orders/create.test.js frees an order of its
    // fulfillment. Nothing survives the test.
    const { rows } = await c.query(
      `SELECT o.id FROM orders.orders o WHERE o.direction = 'purchase'
        ORDER BY o.created_at ASC, o.id ASC LIMIT 1`
    );
    const order_id = rows[0]?.id ?? null;
    assert.ok(order_id, "dev has no purchase order at all");

    // THE LINK IS WHAT HAS TO GO: shipping.pickups.shipment_id is a foreign
    // key into shipping.shipments, so the question is whether the order has a
    // shipment - answered through its fulfillment.
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

// The status vocabulary is enforced by a CHECK constraint, and the cancel path
// used the British spelling. Pinning it here so the two cannot drift apart
// again without a test saying so.
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

// THE SHAPE IS THE ROW (ruling 12, D214): compose.ts, which reconstructed
// order_id, user_id and carrier through the shipment, is deleted - a caller
// who needs those reaches them through shipping/shipments now. This is
// compared against shipping.pickups' own column list, not exchange's.
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
