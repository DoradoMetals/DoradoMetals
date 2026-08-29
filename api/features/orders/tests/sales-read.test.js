// Sales order reads against real Postgres.
//
// A sales order shares orders.orders with purchase orders and is told apart by
// direction alone, so the tests that matter most are the ones about the two not
// bleeding into each other. Each runs inside a transaction that is rolled back.
import test, { after, before } from "node:test";
import assert from "node:assert/strict";
import pool from "#db";
import { LOCKS, takeLocks } from "#shared/testing/locks.ts";
import * as readService from "#features/orders/read.service.ts";
import * as purchase from "#features/orders/read.service.ts";

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

// The composed query this was compared against died with the read pivot; the
// CONTRACT is the independent statement of the shape now, and validate:wire
// parses real rows through it - this pin is the cheap in-suite version.
// See the note in features/orders/tests/purchase-read.test.ts: the contract
// stopped describing this shape when the order wire slimmed (wave 3). This is
// the API's OWN composed order - what the PDFs and the supplier email need -
// pinned against the explicit list compose.ts builds.
const COMPOSED_FIELDS = [
  "id", "user_id", "address_id", "supplier_id", "status", "notes",
  "created_at", "updated_at", "created_by", "updated_by", "number",
  "review_created", "order_sent", "tracking_updated", "shipping_service",
  "used_funds", "totals", "order_items", "address", "shipment", "user",
];

test("the composed order carries exactly the fields compose.ts builds", async () => {
  const [b] = await readService.getAllSales();
  assert.ok(b, "no orders came back - this proves nothing");
  assert.deepEqual(Object.keys(b).sort(), [...COMPOSED_FIELDS].sort());
});

// The two kinds of order share a table now. A purchase order surfacing in a
// customer's sales order list would show them someone else's business.
test("purchase orders and sales orders do not bleed into each other", async () => {
  const sales = (await readService.getAllSales()).map((o) => o.id);
  const purchases = (await purchase.getAllPurchases()).map((o) => o.id);
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
    const all = await readService.getAllSales();
    assert.ok(all.length, "getAll returned nothing, so this test asserts nothing");
    for (const o of all) {
      const { rows: [t] } = await c.query(
        "SELECT total, items, shipping, surcharge, funds FROM orders.transactions WHERE order_id = $1",
        [o.id]
      );
      assert.ok(t, `sales order ${o.number} has no transaction row`);
      // The Next wire nests the money as `totals`, under the transaction
      // table's own names (D84).
      assert.equal(Number(o.totals.total), Number(t.total));
      assert.equal(Number(o.totals.items), Number(t.items));
      assert.equal(Number(o.totals.shipping), Number(t.shipping));
      assert.equal(Number(o.totals.surcharge), Number(t.surcharge));
      assert.equal(Number(o.totals.funds), Number(t.funds));
    }
  });
});

// used_funds is a boolean and funds is an amount. They were nearly conflated
// during the backfill - a zero balance applied and no balance applied are
// different things.
test("used_funds stays a boolean beside the funds amount", async () => {
  const all = await readService.getAllSales();
  assert.ok(all.length, "getAll returned nothing, so this test asserts nothing");
  for (const o of all) {
    assert.equal(typeof o.used_funds, "boolean");
    assert.equal(typeof o.totals.funds, "number");
  }
});

test("the address id still resolves in exchange.addresses", async () => {
  await inRollback(async (c) => {
    const withAddress = (await readService.getAllSales()).filter((o) => o.address_id);
    assert.ok(withAddress.length);
    for (const o of withAddress) {
      const { rows } = await c.query("SELECT 1 FROM exchange.addresses WHERE id = $1", [o.address_id]);
      assert.equal(rows.length, 1, `address_id ${o.address_id} does not resolve`);
    }
  });
});


test("every line resolves to a product", async () => {
  const all = await readService.getAllSales();
  assert.ok(all.length, "getAll returned nothing, so this test asserts nothing");
  let lines = 0;
  for (const o of all) {
    for (const item of o.order_items) {
      lines += 1;
      assert.ok(item.product?.id, `line ${item.id} has no product`);
      assert.equal(typeof item.product.name, "string");
      assert.equal(typeof item.product.metal_type, "string");
    }
  }
  // An individual order may legitimately have no lines - that is the itemless
  // case - so the floor is the total across all of them, not one per order.
  assert.ok(lines, "no sales order had a single line, so this test asserts nothing");
});

test("orders come back newest first", async () => {
  const dates = (await readService.getAllSales()).map((o) => new Date(o.created_at).getTime());
  assert.deepEqual(dates, [...dates].sort((a, b) => b - a));
});

// COUNTED UNDER THE ORDERS LOCK, and that is not caution - it is the fix for a
// real flake. This file declared no lock, so it counted orders.transactions
// across a read while the order-PLACING files were committing rows on their own
// connections: the gate reported 55 !== 56 and the same test passed alone. A
// row appearing during a read of an unrelated feature is not this read writing,
// and an assertion that cannot tell the two apart is not measuring what it
// claims to. See shared/testing/locks.ts - the ORDERS lock is exactly the
// serialisation that makes a count meaningful.
test("reads do not write", async () => {
  await inRollback(async (c) => {
    await takeLocks(c, [LOCKS.ORDERS]);
    const before = await c.query("SELECT count(*)::int n FROM orders.transactions");
    await readService.getAllSales();
    const after = await c.query("SELECT count(*)::int n FROM orders.transactions");
    assert.equal(after.rows[0].n, before.rows[0].n);
  });
});
