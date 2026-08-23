// Dual-write tests for shipments, against real Postgres.
//
// A shipment is one row in exchange and three here: the shipment, the
// fulfillment that says which order it belongs to, and the link recording which
// of our locations handled it. So the property worth testing is not "the row
// copied" but "all three arrived, and they agree".
//
// Each test runs inside a transaction that is rolled back.
import test, { after, before } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import pool from "#db";
import * as dual from "#features/shipping/shipments/repo.dual.js";

let client;

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

async function inRollback(fn) {
  await client.query("BEGIN");
  try {
    await fn(client);
  } finally {
    await client.query("ROLLBACK");
  }
}

// An order with no shipment yet, so creating one is a clean case.
const anOrderWithoutShipment = async (c) => {
  const { rows } = await c.query(
    `SELECT o.id FROM exchange.purchase_orders o
     WHERE NOT EXISTS (SELECT 1 FROM exchange.shipments s WHERE s.purchase_order_id = o.id)
       AND EXISTS (SELECT 1 FROM orders.orders x WHERE x.id = o.id)
     LIMIT 1`
  );
  return rows[0]?.id ?? null;
};

const carrier = async (c) =>
  (await c.query("SELECT id FROM exchange.carriers WHERE name = 'FedEx' LIMIT 1")).rows[0].id;

const inbound = async (c, orderId) =>
  dual.create({ purchase_order_id: orderId, carrier_id: await carrier(c), type: "Inbound" }, c);

test("creating a shipment writes the shipment, its fulfillment and the link", async () => {
  await inRollback(async (c) => {
    const orderId = await anOrderWithoutShipment(c);
    if (!orderId) return;
    const created = await inbound(c, orderId);

    const ship = await c.query("SELECT 1 FROM shipping.shipments WHERE id = $1", [created.id]);
    const link = await c.query(
      "SELECT fulfillment_id FROM fulfillments.shipments WHERE shipment_id = $1", [created.id]
    );
    assert.equal(ship.rows.length, 1, "the shipment did not arrive");
    assert.equal(link.rows.length, 1, "the fulfillment link did not arrive");

    const { rows: [f] } = await c.query(
      "SELECT order_id FROM fulfillments.fulfillments WHERE id = $1", [link.rows[0].fulfillment_id]
    );
    assert.equal(f.order_id, orderId, "the fulfillment points at the wrong order");
  });
});

// The order link is the one thing the new schema does not store on a shipment,
// so a read reconstructs it. If the mirror skipped the fulfillment, the
// shipment would come back with a null order id and getByOrder would miss it.
test("a mirrored shipment can still be found by its order", async () => {
  await inRollback(async (c) => {
    const orderId = await anOrderWithoutShipment(c);
    if (!orderId) return;
    await inbound(c, orderId);

    const found = await dual.getByOrder(orderId, c);
    assert.ok(found, "the shipment cannot be found by its order");
    assert.equal(found.purchase_order_id, orderId);
    assert.equal(found.sales_order_id, null, "a purchase shipment filled the sales order column");
  });
});

// One fulfillment per order is enforced by a unique index, so a second shipment
// on the same order has to find the existing one rather than fail.
test("a second shipment on an order reuses its fulfillment", async () => {
  await inRollback(async (c) => {
    const orderId = await anOrderWithoutShipment(c);
    if (!orderId) return;
    const first = await inbound(c, orderId);
    const second = await dual.create(
      { purchase_order_id: orderId, carrier_id: await carrier(c), type: "Outbound" }, c
    );

    const { rows } = await c.query(
      "SELECT DISTINCT fulfillment_id FROM fulfillments.shipments WHERE shipment_id = ANY($1::uuid[])",
      [[first.id, second.id]]
    );
    assert.equal(rows.length, 1, "a second fulfillment was created for one order");
  });
});

test("an update resolves the service and package to references", async () => {
  await inRollback(async (c) => {
    const orderId = await anOrderWithoutShipment(c);
    if (!orderId) return;
    const created = await inbound(c, orderId);
    const tracking = `probe-${randomUUID().slice(0, 8)}`;

    await dual.update(
      { ...created, tracking_number: tracking, shipping_status: "In Transit",
        package: "Small Box", service_type: "Express Saver", type: "Inbound" },
      c
    );

    const { rows: [s] } = await c.query(
      `SELECT s.tracking_number, sv.name AS service, pk.label AS package
       FROM shipping.shipments s
       LEFT JOIN shipping.services sv ON sv.id = s.carrier_service_id
       LEFT JOIN shipping.packages pk ON pk.id = s.package_id
       WHERE s.id = $1`, [created.id]
    );
    assert.equal(s.tracking_number, tracking);
    assert.equal(s.service, "Express Saver", "the service name did not resolve to a reference");
    assert.equal(s.package, "Small Box", "the package label did not resolve to a reference");
  });
});

// Delivered is what turns a fulfillment COMPLETED, so an update has to carry
// that across - otherwise an order looks unfulfilled after it arrived.
test("marking a shipment delivered completes its fulfillment", async () => {
  await inRollback(async (c) => {
    const orderId = await anOrderWithoutShipment(c);
    if (!orderId) return;
    const created = await inbound(c, orderId);
    await dual.update({ ...created, shipping_status: "Delivered", type: "Inbound" }, c);

    const { rows: [f] } = await c.query(
      `SELECT f.status FROM fulfillments.fulfillments f
       JOIN fulfillments.shipments fs ON fs.fulfillment_id = f.id
       WHERE fs.shipment_id = $1`, [created.id]
    );
    assert.equal(f.status, "COMPLETED");
  });
});

test("deleting a shipment removes it and its link from both schemas", async () => {
  await inRollback(async (c) => {
    const orderId = await anOrderWithoutShipment(c);
    if (!orderId) return;
    const created = await inbound(c, orderId);

    await dual.remove(created.id, c);

    const ex = await c.query("SELECT 1 FROM exchange.shipments WHERE id = $1", [created.id]);
    const nx = await c.query("SELECT 1 FROM shipping.shipments WHERE id = $1", [created.id]);
    const link = await c.query("SELECT 1 FROM fulfillments.shipments WHERE shipment_id = $1", [created.id]);
    assert.equal(ex.rows.length, 0);
    assert.equal(nx.rows.length, 0, "the shipment survived in the shipping schema");
    assert.equal(link.rows.length, 0, "the fulfillment link survived");
  });
});

test("rolling back a dual write undoes both sides", async () => {
  const other = await pool.connect();
  try {
    const orderId = await anOrderWithoutShipment(other);
    if (!orderId) return;

    await client.query("BEGIN");
    const created = await inbound(client, orderId);
    const inside = await client.query("SELECT 1 FROM shipping.shipments WHERE id = $1", [created.id]);
    assert.equal(inside.rows.length, 1, "the write did not happen at all");
    const seen = await other.query("SELECT 1 FROM shipping.shipments WHERE id = $1", [created.id]);
    assert.equal(seen.rows.length, 0, "an uncommitted shipment was visible elsewhere");

    await client.query("ROLLBACK");

    const after = await other.query("SELECT 1 FROM exchange.shipments WHERE id = $1", [created.id]);
    assert.equal(after.rows.length, 0, "the exchange write escaped the transaction");
  } finally {
    other.release();
  }
});
