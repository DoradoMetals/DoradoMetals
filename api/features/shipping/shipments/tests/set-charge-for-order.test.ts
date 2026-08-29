// The shipping cost of an order's parcels, in both schemas.
//
// This is the D41 write: purchase-orders used to run
// `UPDATE exchange.shipments SET net_charge` itself, which made it a second
// writer to a table features/shipping already owns and dual-writes. After the
// purchase-orders pivot it would have been the ONE writer that still wrote
// exchange alone, and the column would have drifted apart between the schemas
// with nothing to report it - verify:parity does not cover shipments, because
// it compares 1:1 pairs and a shipment is a merge.
//
// So what is worth pinning is not "the update ran" but "both halves moved, and
// they moved together". Each test rolls back.
import test, { after, before } from "node:test";
import assert from "node:assert/strict";
import type { PoolClient } from "pg";
import pool from "#db";
import * as shipmentService from "#features/shipping/shipments/service.ts";

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

// An order whose shipment exists in BOTH schemas. The whole point is comparing
// the two halves, so an order the backfill has not reached yet cannot answer
// the question - it would pass by updating nothing on one side.
const anOrderInBothSchemas = async (c: PoolClient) => {
  const { rows } = await c.query(`
    SELECT es.purchase_order_id AS order_id
      FROM exchange.shipments es
      JOIN fulfillments.fulfillments f ON f.order_id = es.purchase_order_id
      JOIN fulfillments.shipments fs ON fs.fulfillment_id = f.id
      JOIN shipping.shipments ss ON ss.id = fs.shipment_id
     WHERE es.purchase_order_id IS NOT NULL
     LIMIT 1`);
  return rows[0]?.order_id ?? null;
};

test("a charge lands in both schemas", async () => {
  await inRollback(async (c: PoolClient) => {
    const orderId = await anOrderInBothSchemas(c);
    assert.ok(
      orderId,
      "no purchase order has a shipment in both schemas - this test cannot " +
        "compare the two halves and must not pass by updating nothing"
    );

    // A value nothing already holds, so this cannot pass by coincidence.
    const charge = 41.37;
    await shipmentService.setChargeForOrder(orderId, charge, c);

    const ex = await c.query(
      "SELECT net_charge FROM exchange.shipments WHERE purchase_order_id = $1", [orderId]
    );
    const nx = await c.query(`
      SELECT ss.cost
        FROM shipping.shipments ss
        JOIN fulfillments.shipments fs ON fs.shipment_id = ss.id
        JOIN fulfillments.fulfillments f ON f.id = fs.fulfillment_id
       WHERE f.order_id = $1`, [orderId]);

    assert.ok(ex.rows.length > 0, "the exchange half updated no rows");
    assert.ok(nx.rows.length > 0, "the new-schema half updated no rows");
    for (const r of ex.rows) assert.equal(Number(r.net_charge), charge);
    for (const r of nx.rows) assert.equal(Number(r.cost), charge);
  });
});

// exchange keys a shipment by purchase_order_id OR sales_order_id and the
// caller holds one id without knowing which. Matching both columns is what
// makes the legacy half select the same rows the new schema's single order_id
// does - and it must not reach across to an unrelated order.
test("the charge lands on that order and no other", async () => {
  await inRollback(async (c: PoolClient) => {
    const orderId = await anOrderInBothSchemas(c);
    assert.ok(orderId, "no purchase order has a shipment in both schemas");

    const others = await c.query(
      `SELECT id, net_charge FROM exchange.shipments
        WHERE purchase_order_id IS DISTINCT FROM $1 ORDER BY id`, [orderId]
    );
    assert.ok(others.rows.length > 0, "dev has no other shipment to compare against");

    await shipmentService.setChargeForOrder(orderId, 41.37, c);

    const after = await c.query(
      `SELECT id, net_charge FROM exchange.shipments
        WHERE purchase_order_id IS DISTINCT FROM $1 ORDER BY id`, [orderId]
    );
    assert.deepEqual(
      after.rows.map((r) => [r.id, String(r.net_charge)]),
      others.rows.map((r) => [r.id, String(r.net_charge)]),
      "the update reached a shipment belonging to another order"
    );
  });
});

// The write must join the caller's transaction. If either half opened its own
// connection it would commit while the caller rolled back, and the two schemas
// would disagree in exactly the way this write exists to prevent.
test("rolling back undoes both halves", async () => {
  const other = await pool.connect();
  try {
    const orderId = await anOrderInBothSchemas(other);
    assert.ok(orderId, "no purchase order has a shipment in both schemas");
    const before = (await other.query(
      "SELECT net_charge FROM exchange.shipments WHERE purchase_order_id = $1 ORDER BY id", [orderId]
    )).rows.map((r) => String(r.net_charge));

    await client.query("BEGIN");
    await shipmentService.setChargeForOrder(orderId, 99.99, client);
    await client.query("ROLLBACK");

    const after = (await other.query(
      "SELECT net_charge FROM exchange.shipments WHERE purchase_order_id = $1 ORDER BY id", [orderId]
    )).rows.map((r) => String(r.net_charge));
    assert.deepEqual(after, before, "the write escaped the transaction");
  } finally {
    other.release();
  }
});
