// Sales order reads against real Postgres.
//
// A sales order shares orders.orders with purchase orders and is told apart by
// direction alone, so the tests that matter most are the ones about the two not
// bleeding into each other. Each runs inside a transaction that is rolled back.
import test, { after, before } from "node:test";
import assert from "node:assert/strict";
import pool from "#db";
import * as next from "#features/sales-orders/repo.next.js";
import * as exchange from "#features/sales-orders/repo.exchange.js";
import * as purchase from "#features/purchase-orders/repo.next.js";

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

test("a sales order carries the same columns it always did", async () => {
  const [a] = await exchange.getAll();
  const [b] = await next.getAll();
  assert.deepEqual(Object.keys(b).sort(), Object.keys(a).sort());
});

// The two kinds of order share a table now. A purchase order surfacing in a
// customer's sales order list would show them someone else's business.
test("purchase orders and sales orders do not bleed into each other", async () => {
  const sales = (await next.getAll()).map((o) => o.id);
  const purchases = (await purchase.getAll()).map((o) => o.id);
  assert.equal(sales.some((id) => purchases.includes(id)), false);

  await inRollback(async (c) => {
    const { rows } = await c.query(
      "SELECT direction, count(*)::int n FROM orders.orders WHERE id = ANY($1) GROUP BY 1",
      [sales]
    );
    assert.deepEqual(rows, [{ direction: "sale", n: sales.length }]);
  });
});

test("the money comes back off the transaction, not the order", async () => {
  await inRollback(async (c) => {
    for (const o of await next.getAll()) {
      const { rows: [t] } = await c.query(
        "SELECT total, items, shipping, surcharge, funds FROM orders.transactions WHERE order_id = $1",
        [o.id]
      );
      assert.ok(t, `sales order ${o.number ?? o.order_number} has no transaction row`);
      assert.equal(Number(o.order_total), Number(t.total));
      assert.equal(Number(o.item_total), Number(t.items));
      assert.equal(Number(o.shipping_cost), Number(t.shipping));
      assert.equal(Number(o.charges_amount), Number(t.surcharge));
      assert.equal(Number(o.pre_charges_amount), Number(t.funds));
    }
  });
});

// used_funds is a boolean and funds is an amount. They were nearly conflated
// during the backfill - a zero balance applied and no balance applied are
// different things.
test("used_funds stays a boolean beside the funds amount", async () => {
  for (const o of await next.getAll()) {
    assert.equal(typeof o.used_funds, "boolean");
    assert.equal(typeof o.pre_charges_amount, "number");
  }
});

test("the address id still resolves in exchange.addresses", async () => {
  await inRollback(async (c) => {
    const withAddress = (await next.getAll()).filter((o) => o.address_id);
    assert.ok(withAddress.length);
    for (const o of withAddress) {
      const { rows } = await c.query("SELECT 1 FROM exchange.addresses WHERE id = $1", [o.address_id]);
      assert.equal(rows.length, 1, `address_id ${o.address_id} does not resolve`);
    }
  });
});

// A sales order has no offer, which is why offers is its own table rather than
// columns null on half of orders.orders.
test("no sales order has an offer row", async () => {
  await inRollback(async (c) => {
    const ids = (await next.getAll()).map((o) => o.id);
    const { rows } = await c.query(
      "SELECT count(*)::int n FROM orders.offers WHERE order_id = ANY($1)", [ids]
    );
    assert.equal(rows[0].n, 0);
  });
});

test("every line resolves to a product", async () => {
  for (const o of await next.getAll()) {
    for (const item of o.order_items) {
      assert.ok(item.product?.id, `line ${item.id} has no product`);
      assert.equal(typeof item.product.product_name, "string");
      assert.equal(typeof item.product.metal_type, "string");
    }
  }
});

test("orders come back newest first", async () => {
  const dates = (await next.getAll()).map((o) => new Date(o.created_at).getTime());
  assert.deepEqual(dates, [...dates].sort((a, b) => b - a));
});

test("reads do not write", async () => {
  await inRollback(async (c) => {
    const before = await c.query("SELECT count(*)::int n FROM orders.transactions");
    await next.getAll();
    const after = await c.query("SELECT count(*)::int n FROM orders.transactions");
    assert.equal(after.rows[0].n, before.rows[0].n);
  });
});
