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
import * as dual from "#features/purchase-orders/repo.dual.js";
import * as next from "#features/purchase-orders/repo.next.js";

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

// Joined to orders.orders on purpose. `node --test` runs test files in
// parallel, and features/purchase-orders/service.test.js commits real purchase
// orders as fixtures - the services open their own transactions, so it has to.
// Picking simply the newest purchase order could select one of those mid-run,
// and it would have no mirrored rows to assert against.
const anOrder = async (c) =>
  (await c.query(`SELECT p.id FROM exchange.purchase_orders p
     JOIN orders.orders o ON o.id = p.id
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

// The offer's columns live on exchange.purchase_orders and in orders.offers, so
// a single write has to reach a different table in each schema.
test("an offer rejection reaches orders.offers, not orders.orders", async () => {
  await inRollback(async (c) => {
    const id = await anOrder(c);
    const before = await c.query("SELECT num_rejections FROM exchange.purchase_orders WHERE id = $1", [id]);
    await dual.rejectOfferById(id, "not enough", c);

    const ex = await c.query("SELECT offer_notes, num_rejections FROM exchange.purchase_orders WHERE id = $1", [id]);
    const nx = await c.query("SELECT notes, num_rejections, offer_status FROM orders.offers WHERE order_id = $1", [id]);
    assert.equal(ex.rows[0].offer_notes, "not enough");
    assert.equal(nx.rows[0].notes, "not enough");
    assert.equal(Number(nx.rows[0].num_rejections), Number(before.rows[0].num_rejections) + 1);
    assert.equal(nx.rows[0].offer_status, "Rejected");
  });
});

// One write to exchange.purchase_orders, three tables touched in the new schema.
test("accepting an offer updates the order, the offer and the transaction", async () => {
  await inRollback(async (c) => {
    const id = await anOrder(c);
    await dual.moveOrderToAccepted(id, 1234.56, c);

    const order = await c.query("SELECT status FROM orders.orders WHERE id = $1", [id]);
    const offer = await c.query("SELECT offer_status, spots_locked, offer_amount FROM orders.offers WHERE order_id = $1", [id]);
    const txn = await c.query("SELECT total FROM orders.transactions WHERE order_id = $1", [id]);
    assert.equal(order.rows[0].status, "Accepted");
    assert.equal(offer.rows[0].offer_status, "Accepted");
    assert.equal(offer.rows[0].spots_locked, true);
    assert.equal(Number(offer.rows[0].offer_amount), 1234.56);
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
    await dual.updateSpot({ spot: { purchase_order_id: id, type: m.type }, updated_spot: 999.99 }, c);

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
    const before = [await count("items"), await count("spots"), await count("offers")];
    await next.mirrorOrder(id, c);
    await next.mirrorItems(id, c);
    await next.mirrorSpots(id, c);
    assert.deepEqual([await count("items"), await count("spots"), await count("offers")], before);
  });
});
