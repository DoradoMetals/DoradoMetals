// Dual-write tests for carrier pickups, against real Postgres.
//
// The first test here is a regression test for a bug that reached production:
// create() named a `shipment_id` column that exchange.carrier_pickups does not
// have, so every insert died on 42703 and no pickup was ever recorded. It threw
// inside the purchase-order transaction, after FedEx had already booked a real
// pickup - so the label write rolled back and the booking survived with nothing
// pointing at it.
//
// Each test runs inside a transaction that is rolled back.
import test, { after, before } from "node:test";
import assert from "node:assert/strict";
import type { PoolClient } from "pg";
import pool from "#db";
// REPOINTED AT THE SERVICE. The behaviour is unchanged - exchange written
// unconditionally, the new schema only when the shipment resolves - it just
// happens natively now instead of being re-derived by a mirror.
import * as dual from "#features/shipping/pickups/service.ts";

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
    `SELECT es.purchase_order_id AS order_id
     FROM exchange.shipments es
     JOIN shipping.shipments ss ON ss.id = es.id
     WHERE es.purchase_order_id IS NOT NULL
     ORDER BY es.id ASC
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
    assert.equal(created.pickup_status, "scheduled");
  });
});

// The date and time arrive separately, as FedEx wants them, and are combined in
// Postgres. A JS Date here would carry the process timezone into a `timestamp
// without time zone` column.
test("the date and time are combined into pickup_requested_at", async () => {
  await inRollback(async (c: PoolClient) => {
    const created = await dual.create(aPickup({ date: "2026-08-22", time: "10:30:00" }), c);
    assert.ok(created, "the pickup was not created");
    const { rows: [row] } = await c.query(
      "SELECT to_char(pickup_requested_at, 'YYYY-MM-DD HH24:MI:SS') AS at FROM exchange.carrier_pickups WHERE id = $1",
      [created.id]
    );
    assert.equal(row.at, "2026-08-22 10:30:00");
  });
});

test("a pickup with no time still records the date at midnight", async () => {
  await inRollback(async (c: PoolClient) => {
    const created = await dual.create(aPickup({ time: null }), c);
    assert.ok(created, "the pickup was not created");
    const { rows: [row] } = await c.query(
      "SELECT to_char(pickup_requested_at, 'YYYY-MM-DD HH24:MI:SS') AS at FROM exchange.carrier_pickups WHERE id = $1",
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
      `SELECT p.shipment_id, es.purchase_order_id
       FROM shipping.pickups p
       JOIN exchange.shipments es ON es.id = p.shipment_id
       WHERE p.id = $1`,
      [created.id]
    );
    assert.equal(rows.length, 1, "the pickup was not mirrored");
    assert.equal(rows[0].purchase_order_id, order_id, "it hung off the wrong order's shipment");
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
      `SELECT o.id FROM exchange.purchase_orders o ORDER BY o.created_at ASC, o.id ASC LIMIT 1`
    );
    const order_id = rows[0]?.id ?? null;
    assert.ok(order_id, "dev has no purchase order at all");

    // THE LINK IS WHAT HAS TO GO, NOT THE exchange ROW.
    //
    // This deleted from exchange.shipments, which was right while the mirror
    // resolved the shipment by matching purchase_order_id there. It no longer
    // does: shipping.pickups.shipment_id is a foreign key into
    // shipping.shipments, so the question is whether the order has a shipment in
    // the NEW schema - answered through its fulfillment. Deleting the exchange
    // row left that link intact and the pickup was mirrored after all, which is
    // how this surfaced.
    await c.query(
      `DELETE FROM fulfillments.shipments fs
        USING fulfillments.fulfillments f
        WHERE f.id = fs.fulfillment_id AND f.order_id = $1`,
      [order_id]
    );
    await c.query(`DELETE FROM exchange.shipments WHERE purchase_order_id = $1`, [order_id]);

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
    assert.ok(created?.id, "the exchange write did not happen");

    const mirrored = await c.query("SELECT 1 FROM shipping.pickups WHERE id = $1", [created.id]);
    assert.equal(mirrored.rows.length, 0, "a pickup was mirrored with no shipment to hang off");
  });
});

test("updating a pickup records the new status rather than the old one", async () => {
  await inRollback(async (c: PoolClient) => {
    const created = await dual.create(aPickup(), c);
    assert.ok(created, "the pickup was not created");
    const updated = await dual.update({ ...created, pickup_status: "canceled" }, c);
    assert.ok(updated, "the update returned no pickup");
    assert.equal(updated.pickup_status, "canceled");
  });
});

// The status vocabulary is enforced by a CHECK constraint, and the cancel path
// used the British spelling. Pinning it here so the two cannot drift apart
// again without a test saying so.
test("the status vocabulary is pending / scheduled / completed / canceled", async () => {
  await inRollback(async (c: PoolClient) => {
    for (const status of ["pending", "scheduled", "completed", "canceled"]) {
      const row = await dual.create(aPickup({ pickup_status: status }), c);
      assert.ok(row, "the pickup could not be read back");
      assert.equal(row.pickup_status, status);
    }
    await assert.rejects(
      () => dual.create(aPickup({ pickup_status: "cancelled" }), c),
      (err: unknown) => (err as Record<string, unknown>).code === "23514",
      "the double-l spelling was accepted; the cancel path would silently work"
    );
  });
});

// THE SHAPE IS COMPARED AGAINST exchange'S OWN ROW, not against a second
// implementation - there is only one now. The eight columns
// exchange.carrier_pickups has are what every caller reads, because its reads
// were `SELECT *`, so that row IS the contract and this reads it directly.
test("the composed pickup has exactly the columns exchange.carrier_pickups has", async () => {
  await inRollback(async (c: PoolClient) => {
    const order_id = await anOrderWithShipment(c);
    assert.ok(order_id, "dev has no order with a shipment");
    const created = await dual.create(aPickup({ order_id }), c);
    assert.ok(created, "the pickup was not created");

    const { rows: [fromExchange] } = await c.query(
      "SELECT * FROM exchange.carrier_pickups WHERE id = $1", [created.id]
    );
    const fromNext = await dual.getById(created.id, c);
    assert.ok(fromNext, "the pickup did not come back from the new schema");

    assert.deepEqual(
      Object.keys(fromNext).sort(),
      Object.keys(fromExchange).sort(),
      "the composed shape has drifted from exchange.carrier_pickups"
    );
    assert.equal(Number(fromNext.confirmation_number), Number(fromExchange.confirmation_number));
    assert.equal(fromNext.order_id, fromExchange.order_id);
    // The three reconstructed through the shipment.
    assert.equal(fromNext.order_id, order_id, "the order id was not reconstructed");
    assert.equal(fromNext.carrier, "FedEx", "the carrier name was not reconstructed");
    assert.ok(fromNext.user_id, "the user id was not reconstructed");
  });
});
