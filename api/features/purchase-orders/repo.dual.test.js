// Dual-write tests for purchase orders, against real Postgres.
//
// The property that matters is that exchange and the orders schema never
// disagree, because that is what makes the switch reversible. Each test writes
// through the dual layer inside a transaction and rolls it back, so dev is
// never actually modified.
import test, { after, before } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import pool from "#db";
import { LOCKS, takeLocks } from "#shared/testing/locks.ts";
import * as dual from "#features/purchase-orders/repo.dual.js";
import * as next from "#features/purchase-orders/repo.next.ts";

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
  await takeLocks(client, [LOCKS.ADDRESSES, LOCKS.ORDERS]);
  try {
    await fn(client);
  } finally {
    await client.query("ROLLBACK");
  }
}

// Joined to orders.orders on purpose. `node --test` runs test files in
// parallel, and features/purchase-orders/service.test.js commits real purchase
// orders as fixtures - the services open their own transactions, so it has to.
// Picking simply the newest purchase order could select one of those mid-run,
// and it would have no mirrored rows to assert against.
// An order that exists in BOTH schemas and HAS spot rows - the spot-change
// test needs one to change, and dev's newest order does not always have any.
// The precondition lives in the query rather than in hope (lesson jj).
const anOrder = async (c) =>
  (await c.query(`SELECT p.id FROM exchange.purchase_orders p
     JOIN orders.orders o ON o.id = p.id
     WHERE EXISTS (SELECT 1 FROM exchange.order_metals m WHERE m.purchase_order_id = p.id)
     ORDER BY p.order_number DESC LIMIT 1`)).rows[0].id;

test("a status change lands in both schemas", async () => {
  await inRollback(async (c) => {
    const id = await anOrder(c);
    await dual.updateStatus({ id }, "Received", "test", c);

    const ex = await c.query("SELECT purchase_order_status s FROM exchange.purchase_orders WHERE id = $1", [id]);
    const nx = await c.query("SELECT status s FROM orders.orders WHERE id = $1", [id]);
    assert.equal(ex.rows[0].s, "Received");
    assert.equal(nx.rows[0].s, "Received");
  });
});

// 086 removed offers; the pure-label ruling (28 August) then removed the
// status from this write too - recordOrderPricing is acceptOrder minus the
// 'Accepted' label, which left the lifecycle in migration 092. A money write
// and the pin, one statement against exchange, two tables in the new schema,
// and the status column UNTOUCHED.
test("finalizing pricing updates the money and the pin, never the status", async () => {
  await inRollback(async (c) => {
    const id = await anOrder(c);
    const before = await c.query("SELECT status FROM orders.orders WHERE id = $1", [id]);
    await dual.recordOrderPricing(id, 1234.56, c);

    const order = await c.query(
      "SELECT status, spots_locked FROM orders.orders WHERE id = $1", [id]
    );
    const txn = await c.query("SELECT total FROM orders.transactions WHERE order_id = $1", [id]);
    assert.equal(order.rows[0].status, before.rows[0].status, "pricing moved the label");
    assert.equal(order.rows[0].spots_locked, true, "pricing must pin the spots");
    assert.equal(Number(txn.rows[0].total), 1234.56);
  });
});

test("a fee change lands on the transaction", async () => {
  await inRollback(async (c) => {
    const id = await anOrder(c);
    await dual.updateRefinerFee(id, 42.5, c);
    const txn = await c.query("SELECT refiner_fee FROM orders.transactions WHERE order_id = $1", [id]);
    assert.equal(Number(txn.rows[0].refiner_fee), 42.5);
  });
});

// A deleted line has to disappear from both. If the mirror only upserted, the
// new schema would keep a line the customer is no longer being paid for.
test("deleting a line removes it from both schemas", async () => {
  await inRollback(async (c) => {
    const { rows: [item] } = await c.query(
      `SELECT poi.id, poi.purchase_order_id FROM exchange.purchase_order_items poi LIMIT 1`
    );
    await dual.deleteOrderItems([item.id], c);

    const ex = await c.query("SELECT 1 FROM exchange.purchase_order_items WHERE id = $1", [item.id]);
    const nx = await c.query("SELECT 1 FROM orders.items WHERE id = $1", [item.id]);
    assert.equal(ex.rows.length, 0);
    assert.equal(nx.rows.length, 0, "the line survived in the orders schema");
  });
});

test("an item premium change lands in both, found by item id alone", async () => {
  await inRollback(async (c) => {
    const { rows: [item] } = await c.query("SELECT id FROM exchange.purchase_order_items LIMIT 1");
    await dual.updatePremium(item.id, 0.77, c);
    const nx = await c.query("SELECT premium FROM orders.items WHERE id = $1", [item.id]);
    assert.equal(Number(nx.rows[0].premium), 0.77);
  });
});

test("a spot change lands in both, keyed by order and metal", async () => {
  await inRollback(async (c) => {
    const id = await anOrder(c);
    const { rows: [m] } = await c.query(
      "SELECT type FROM exchange.order_metals WHERE purchase_order_id = $1 LIMIT 1", [id]
    );
    // The body's spot speaks the converted names (D84): `name`, not `type`.
    await dual.updateSpot({ spot: { purchase_order_id: id, name: m.type }, updated_spot: 999.99 }, c);

    const nx = await c.query(
      `SELECT sp.bid FROM orders.spots sp JOIN metals.metals mt ON mt.id = sp.metal_id
       WHERE sp.order_id = $1 AND mt.name = $2`, [id, m.type]
    );
    assert.equal(Number(nx.rows[0].bid), 999.99);
  });
});

// The one write that makes an id. exchange generates it and the mirror copies
// it, so the two schemas agree by construction rather than by both generating.
test("creating an order gives both schemas the same id and an address", async () => {
  await inRollback(async (c) => {
    const { rows: [u] } = await c.query("SELECT id FROM exchange.users LIMIT 1");
    const { rows: [a] } = await c.query("SELECT id FROM exchange.addresses LIMIT 1");
    const id = await dual.insertOrder(c, { userId: u.id, addressId: a.id, status: "Pending" });

    const ex = await c.query("SELECT id FROM exchange.purchase_orders WHERE id = $1", [id]);
    const nx = await c.query("SELECT id, direction FROM orders.orders WHERE id = $1", [id]);
    assert.equal(ex.rows.length, 1);
    assert.equal(nx.rows[0].id, id);
    assert.equal(nx.rows[0].direction, "purchase");

    const addr = await c.query(
      "SELECT source_address_id FROM orders.addresses WHERE order_id = $1", [id]
    );
    assert.equal(addr.rows[0].source_address_id, a.id, "the order has no address snapshot");

    // Born with its engagement (093's invariant, ensured by the mirror on the
    // LIVE create path): one refiners.orders row, no refinery named yet.
    const ro = await c.query("SELECT refiner_id FROM refiners.orders WHERE order_id = $1", [id]);
    assert.equal(ro.rows.length, 1, "the order has no refiners.orders engagement row");
    assert.equal(ro.rows[0].refiner_id, null, "a new engagement names no refinery yet");
  });
});

// The mirror must join the caller's transaction. If it opened its own
// connection, rolling the write back would leave the mirrored row behind - the
// exact divergence dual-write exists to prevent.
test("rolling back a dual write undoes both sides", async () => {
  // Checked from a second connection, which is what a concurrent request would
  // be - and what proves the rollback rather than just reading back through the
  // transaction that performed it.
  const other = await pool.connect();
  try {
    const id = (await other.query(
      `SELECT p.id FROM exchange.purchase_orders p
     JOIN orders.orders o ON o.id = p.id
     ORDER BY p.order_number DESC LIMIT 1`
    )).rows[0].id;
    const before = (await other.query("SELECT status FROM orders.orders WHERE id = $1", [id])).rows[0].status;

    await client.query("BEGIN");
    await dual.updateStatus({ id }, `rolled-back-${randomUUID().slice(0, 8)}`, "test", client);
    await client.query("ROLLBACK");

    const after = (await other.query("SELECT status FROM orders.orders WHERE id = $1", [id])).rows[0].status;
    const ex = (await other.query(
      "SELECT purchase_order_status s FROM exchange.purchase_orders WHERE id = $1", [id]
    )).rows[0].s;
    assert.equal(after, before, "the mirror escaped the transaction");
    assert.equal(ex, before, "the exchange write escaped the transaction");
  } finally {
    other.release();
  }
});

test("a dual write on a client is invisible on another connection", async () => {
  const other = await pool.connect();
  await client.query("BEGIN");
  try {
    const id = await anOrder(client);
    // A value no order could already hold. The first version of this test wrote
    // "Received", which the newest order already was, so it passed without
    // proving anything - the same vacuous-test trap the sales tax dual-write hit.
    const sentinel = `uncommitted-${randomUUID().slice(0, 8)}`;
    await dual.updateStatus({ id }, sentinel, "test", client);

    const inside = await client.query("SELECT status FROM orders.orders WHERE id = $1", [id]);
    assert.equal(inside.rows[0].status, sentinel, "the write did not happen at all");

    const seen = await other.query("SELECT status FROM orders.orders WHERE id = $1", [id]);
    assert.notEqual(seen.rows[0].status, sentinel, "an uncommitted write was visible elsewhere");
  } finally {
    await client.query("ROLLBACK");
    other.release();
  }
});

// Re-running a mirror must not duplicate anything: every write triggers one,
// and an order is mirrored many times over its life.
test("mirroring twice changes nothing", async () => {
  await inRollback(async (c) => {
    const id = await anOrder(c);
    const count = async (t) =>
      (await c.query(`SELECT count(*)::int n FROM orders.${t} WHERE order_id = $1`, [id])).rows[0].n;
    await next.mirrorOrder(id, c);
    await next.mirrorItems(id, c);
    await next.mirrorSpots(id, c);
    const before = [await count("items"), await count("spots")];
    await next.mirrorOrder(id, c);
    await next.mirrorItems(id, c);
    await next.mirrorSpots(id, c);
    assert.deepEqual([await count("items"), await count("spots")], before);
  });
});
