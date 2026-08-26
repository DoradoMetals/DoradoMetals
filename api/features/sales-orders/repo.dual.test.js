// Dual-write tests for sales orders, against real Postgres.
//
// The property that matters is that exchange and the orders schema never
// disagree - that is what makes the switch reversible. Each test writes through
// the dual layer inside a transaction and rolls it back, so dev is never
// actually modified.
import test, { after, before } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import pool from "#db";
import { LOCKS, takeLocks } from "#shared/testing/locks.js";
import * as dual from "#features/sales-orders/repo.dual.js";
import * as next from "#features/sales-orders/repo.next.ts";

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

// Joined to orders.orders for the same reason as the purchase-order tests:
// test files run in parallel and another file commits order fixtures.
const anOrder = async (c) =>
  (await c.query(`SELECT s.id FROM exchange.sales_orders s
     JOIN orders.orders o ON o.id = s.id
     ORDER BY s.order_number DESC LIMIT 1`)).rows[0].id;

test("a status change lands in both schemas", async () => {
  await inRollback(async (c) => {
    const id = await anOrder(c);
    const status = `probe-${randomUUID().slice(0, 8)}`;
    await dual.updateStatus({ id }, status, "test", c);

    const ex = await c.query("SELECT sales_order_status s FROM exchange.sales_orders WHERE id = $1", [id]);
    const nx = await c.query("SELECT status s FROM orders.orders WHERE id = $1", [id]);
    assert.equal(ex.rows[0].s, status);
    assert.equal(nx.rows[0].s, status);
  });
});

test("order_sent and tracking_updated land on the order, not the transaction", async () => {
  await inRollback(async (c) => {
    const id = await anOrder(c);
    await c.query("UPDATE exchange.sales_orders SET order_sent = false, tracking_updated = false WHERE id = $1", [id]);
    await dual.updateOrderSent(id, c);
    await dual.updateTrackingStatus(id, c);

    const nx = await c.query("SELECT order_sent, tracking_updated FROM orders.orders WHERE id = $1", [id]);
    const ex = await c.query("SELECT order_sent, tracking_updated FROM exchange.sales_orders WHERE id = $1", [id]);
    assert.equal(nx.rows[0].order_sent, ex.rows[0].order_sent);
    assert.equal(nx.rows[0].tracking_updated, ex.rows[0].tracking_updated);
  });
});

// The one column a sales order carries that a purchase order does not, and it
// changes name on the way across.
test("attaching a supplier becomes refinery_id", async () => {
  await inRollback(async (c) => {
    const id = await anOrder(c);
    const { rows: [r] } = await c.query("SELECT id FROM refiners.refiners LIMIT 1");
    await dual.attachSupplierToOrder(id, r.id, c);

    const ex = await c.query("SELECT supplier_id FROM exchange.sales_orders WHERE id = $1", [id]);
    const nx = await c.query("SELECT refinery_id FROM orders.orders WHERE id = $1", [id]);
    assert.equal(ex.rows[0].supplier_id, r.id);
    assert.equal(nx.rows[0].refinery_id, r.id);
  });
});

// A sales order's money lives in orders.transactions, so a write to
// exchange.sales_orders has to reach a different table in the new schema.
test("the money stays in step with the order", async () => {
  await inRollback(async (c) => {
    const id = await anOrder(c);
    await c.query(
      "UPDATE exchange.sales_orders SET order_total = 987.65, base_total = 900, used_funds = true WHERE id = $1",
      [id]
    );
    await next.mirrorOrder(id, c);

    const t = await c.query(
      "SELECT total, base_total, used_funds FROM orders.transactions WHERE order_id = $1", [id]
    );
    assert.equal(Number(t.rows[0].total), 987.65);
    assert.equal(Number(t.rows[0].base_total), 900);
    assert.equal(t.rows[0].used_funds, true);
  });
});

test("a sales order still gets no offer row", async () => {
  await inRollback(async (c) => {
    const id = await anOrder(c);
    await dual.updateStatus({ id }, "Preparing", "test", c);
    const offers = await c.query("SELECT count(*)::int n FROM orders.offers WHERE order_id = $1", [id]);
    assert.equal(offers.rows[0].n, 0);
  });
});

test("creating an order gives both schemas the same id and an address", async () => {
  await inRollback(async (c) => {
    const { rows: [u] } = await c.query("SELECT id, name, email FROM exchange.users LIMIT 1");
    const { rows: [a] } = await c.query("SELECT id FROM exchange.addresses LIMIT 1");
    const created = await dual.insertOrder(c, {
      user: { id: u.id },
      status: "Pending",
      sales_order: {
        address: { id: a.id },
        service: { label: "Standard" },
        using_funds: false,
      },
      orderPrices: {
        order_total: 100,
        shipping_charge: 10,
        pre_charges_amount: 0,
        post_charges_amount: 100,
        subject_to_charges_amount: 90,
        item_total: 90,
        base_total: 90,
        charges_amount: 0,
        sales_tax: 0,
      },
    });
    const id = created?.id ?? created;

    const nx = await c.query("SELECT id, direction FROM orders.orders WHERE id = $1", [id]);
    assert.equal(nx.rows[0].id, id);
    assert.equal(nx.rows[0].direction, "sale");

    const addr = await c.query("SELECT source_address_id FROM orders.addresses WHERE order_id = $1", [id]);
    assert.equal(addr.rows[0].source_address_id, a.id, "the order has no address snapshot");

    // The money has to arrive with the order, not on a later write - a sales
    // order is created with its totals already computed.
    const txn = await c.query(
      "SELECT total, items, shipping, shipping_service FROM orders.transactions WHERE order_id = $1", [id]
    );
    assert.equal(txn.rows.length, 1, "a new sales order has no transaction row");
    assert.equal(Number(txn.rows[0].total), 100);
    assert.equal(Number(txn.rows[0].items), 90);
    assert.equal(Number(txn.rows[0].shipping), 10);
    assert.equal(txn.rows[0].shipping_service, "Standard");
  });
});

// The mirror must join the caller's transaction. If it opened its own, rolling
// the write back would leave the mirrored row behind.
test("rolling back a dual write undoes both sides", async () => {
  const other = await pool.connect();
  try {
    const id = (await other.query(
      `SELECT s.id FROM exchange.sales_orders s
     JOIN orders.orders o ON o.id = s.id
     ORDER BY s.order_number DESC LIMIT 1`
    )).rows[0].id;
    const before = (await other.query("SELECT status FROM orders.orders WHERE id = $1", [id])).rows[0].status;

    await client.query("BEGIN");
    await dual.updateStatus({ id }, `rolled-back-${randomUUID().slice(0, 8)}`, "test", client);
    await client.query("ROLLBACK");

    const after = (await other.query("SELECT status FROM orders.orders WHERE id = $1", [id])).rows[0].status;
    const ex = (await other.query(
      "SELECT sales_order_status s FROM exchange.sales_orders WHERE id = $1", [id]
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
    // A sentinel, so this cannot pass by writing a value the order already had.
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

test("mirroring twice changes nothing", async () => {
  await inRollback(async (c) => {
    const id = await anOrder(c);
    const count = async (t) =>
      (await c.query(`SELECT count(*)::int n FROM orders.${t} WHERE order_id = $1`, [id])).rows[0].n;
    await next.mirrorOrder(id, c);
    await next.mirrorItems(id, c);
    await next.mirrorSpots(id, c);
    const before = [await count("items"), await count("spots"), await count("transactions")];
    await next.mirrorOrder(id, c);
    await next.mirrorItems(id, c);
    await next.mirrorSpots(id, c);
    assert.deepEqual([await count("items"), await count("spots"), await count("transactions")], before);
  });
});
