// Shipments through the service, against real Postgres. Each test runs inside a rolled-back transaction.
// A shipment write touches three rows - the shipment, the fulfillment linking it to an order, and the link between them - so what's worth testing is that all three arrived and agree.
import { test, afterAll, beforeAll } from "vitest";
import assert from "node:assert/strict";
import type { PoolClient } from "pg";
import { randomUUID } from "node:crypto";
import pool from "#db";
import { inRollback } from "#shared/testing/rollback.ts";
import { aUser, anOrder, carrierId } from "#shared/testing/builders/index.ts";
import * as dual from "#domain/shipping/shipments/service.ts";

let client: PoolClient;

beforeAll(async () => {
  assert.equal(
    new Date().getTimezoneOffset(), 0,
    "these tests require TZ=UTC - run them with `pnpm --filter @dorado/api test`"
  );
  client = await pool.connect();
});

afterAll(async () => {
  client.release();
  await pool.end();
});

// An order with no shipment yet, so creating one is a clean case.
// USED TO SEARCH FOR ONE, returning null (and every test returning early) when dev had none shipment-less - all seven passed asserting nothing. Builds one instead, inside the rolled-back transaction, so it can't silently stop finding what it needs.
// THE CUSTOMER IS BUILT AND THE EXCHANGE HALF IS GONE (lane 1). This read a
// real person out of the frozen exchange.users table and then INSERTED into
// exchange.purchase_orders as well as orders.orders - a write to a frozen
// table, dating from the dual era, which nothing in the service has needed
// since D212. The order is one builder call now.
const anOrderWithoutShipment = async (c: PoolClient) => {
  const order = await anOrder(c, await aUser(c), { direction: "purchase" });
  return order.id;
};

const carrier = (c: PoolClient) => carrierId(c, "FedEx");

const inbound = async (c: PoolClient, orderId: string) =>
  dual.create({ purchase_order_id: orderId, carrier_id: await carrier(c), type: "Inbound" }, c);

test("creating a shipment writes the shipment, its fulfillment and the link", async () => {
  await inRollback(async (c: PoolClient) => {
    const orderId = await anOrderWithoutShipment(c);
    assert.ok(orderId, "the fixture did not build an order");
    const created = await inbound(c, orderId);
    assert.ok(created, "the service returned nothing");

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

// The order link isn't stored on a shipment, so a read reconstructs it - if the fulfillment link is missing, getByOrder would miss the shipment entirely.
test("a mirrored shipment can still be found by its order", async () => {
  await inRollback(async (c: PoolClient) => {
    const orderId = await anOrderWithoutShipment(c);
    assert.ok(orderId, "the fixture did not build an order");
    await inbound(c, orderId);

    const found = await dual.getByOrder(orderId, c);
    assert.ok(found, "the shipment cannot be found by its order");

    // The row carries no order id - getOrderLink is the resolution a caller still needs, not the shipment's shape.
    const link = await dual.getOrderLink(found.id, c);
    assert.equal(link?.order_id, orderId);
    assert.equal(link?.direction, "purchase");
  });
});

// One fulfillment per order is enforced by a unique index, so a second shipment on the same order has to find the existing one rather than fail.
test("a second shipment on an order reuses its fulfillment", async () => {
  await inRollback(async (c: PoolClient) => {
    const orderId = await anOrderWithoutShipment(c);
    assert.ok(orderId, "the fixture did not build an order");
    const first = await inbound(c, orderId);
    assert.ok(first, "the first call returned nothing");
    const second = await dual.create(
      { purchase_order_id: orderId, carrier_id: await carrier(c), type: "Outbound" }, c
    );
    assert.ok(second, "the second call returned nothing");

    const { rows } = await c.query(
      "SELECT DISTINCT fulfillment_id FROM fulfillments.shipments WHERE shipment_id = ANY($1::uuid[])",
      [[first.id, second.id]]
    );
    assert.equal(rows.length, 1, "a second fulfillment was created for one order");
  });
});

test("an update resolves the service and package to references", async () => {
  await inRollback(async (c: PoolClient) => {
    const orderId = await anOrderWithoutShipment(c);
    assert.ok(orderId, "the fixture did not build an order");
    const created = await inbound(c, orderId);
    assert.ok(created, "the service returned nothing");
    const tracking = `probe-${randomUUID().slice(0, 8)}`;

    await dual.update(
      // carrier_id is passed explicitly, as the real call sites do - a shell shipment has no service yet, so there's nothing to resolve names against.
      { ...created, carrier_id: await carrier(c), tracking_number: tracking,
        shipping_status: "In Transit",
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

// Delivered is what turns a fulfillment COMPLETED, so an update has to carry that across - otherwise an order looks unfulfilled after it arrived.
test("marking a shipment delivered completes its fulfillment", async () => {
  await inRollback(async (c: PoolClient) => {
    const orderId = await anOrderWithoutShipment(c);
    assert.ok(orderId, "the fixture did not build an order");
    const created = await inbound(c, orderId);
    assert.ok(created, "the service returned nothing");
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
  await inRollback(async (c: PoolClient) => {
    const orderId = await anOrderWithoutShipment(c);
    assert.ok(orderId, "the fixture did not build an order");
    const created = await inbound(c, orderId);
    assert.ok(created, "the service returned nothing");

    await dual.remove(created.id, c);

    const nx = await c.query("SELECT 1 FROM shipping.shipments WHERE id = $1", [created.id]);
    const link = await c.query("SELECT 1 FROM fulfillments.shipments WHERE shipment_id = $1", [created.id]);
    assert.equal(nx.rows.length, 0, "the shipment survived in the shipping schema");
    assert.equal(link.rows.length, 0, "the fulfillment link survived");
  });
});

// The fixture must be built INSIDE the transaction - this test needs a SECOND connection to prove the write is invisible, and building the order there would commit it.
// This leaked five purchase orders into dev before it was caught: the order is built on `client` inside BEGIN; only observations happen on `other`.
//
// "BOTH SIDES" WAS THE DUAL WRITE and there is one side left (D212), so what
// this now pins is the property that outlives it: the shipment AND the order it
// hangs off are one transaction, and a rollback takes both. The exchange
// observations are gone with the writes they watched.
test("rolling back a shipment write undoes the order it hangs off too", async () => {
  const other = await pool.connect();
  try {
    await client.query("BEGIN");
    const orderId = await anOrderWithoutShipment(client);
    assert.ok(orderId, "the fixture did not build an order");

    const created = await inbound(client, orderId);
    assert.ok(created, "the service returned nothing");
    const inside = await client.query("SELECT 1 FROM shipping.shipments WHERE id = $1", [created.id]);
    assert.equal(inside.rows.length, 1, "the write did not happen at all");
    const seen = await other.query("SELECT 1 FROM shipping.shipments WHERE id = $1", [created.id]);
    assert.equal(seen.rows.length, 0, "an uncommitted shipment was visible elsewhere");

    await client.query("ROLLBACK");

    const after = await other.query("SELECT 1 FROM shipping.shipments WHERE id = $1", [created.id]);
    assert.equal(after.rows.length, 0, "the shipment write escaped the transaction");

    // And the fixture itself, which is the half that actually leaked.
    const order = await other.query(
      "SELECT 1 FROM orders.orders WHERE id = $1", [orderId]
    );
    assert.equal(order.rows.length, 0, "the fixture order escaped the transaction");
  } finally {
    other.release();
  }
});
