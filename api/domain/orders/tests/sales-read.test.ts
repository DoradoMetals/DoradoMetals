// THE ORDER VIEW, sale direction, against real Postgres.
//
// A sales order shares orders.orders with purchase orders and is told apart by
// direction alone, so the tests that matter most are the ones about the two not
// bleeding into each other.
//
// `read.service.ts` is gone (D214 item 12): `view()` reads ONE order by id and
// `list()` reads the slim wire, so the assertions that used to run over
// `getAllSales()` run over the list plus a view per order. Two members moved
// with the composer and are asserted where they now live:
//
//   order.used_funds        ->  totals.used_funds (the column it always was)
//   order.address_id        ->  address, the places.addresses snapshot itself
//
// Each test runs inside a transaction that is rolled back.
import { test, afterAll, beforeAll } from "vitest";
import assert from "node:assert/strict";
import type { PoolClient } from "pg";
import pool from "#pool";
import { LOCKS, takeLocks } from "#shared/testing/locks.ts";
import { inRollback } from "#shared/testing/rollback.ts";
import * as orderRead from "#domain/orders/read.ts";

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

const saleIds = async (c?: PoolClient): Promise<string[]> =>
  (await orderRead.list({ direction: "sale" }, c)).map((o) => o.id);

const viewsOf = async (ids: string[]) => {
  const out = [];
  for (const id of ids) {
    const view = await orderRead.view(id);
    assert.ok(view, `order ${id} exists and the view could not read it`);
    out.push(view!);
  }
  return out;
};

// The two kinds of order share a table now. A purchase order surfacing in a
// customer's sales order list would show them someone else's business.
test("purchase orders and sales orders do not bleed into each other", async () => {
  const sales = await saleIds();
  const purchases = (await orderRead.list({ direction: "purchase" })).map((o) => o.id);
  assert.ok(sales.length, "no sales orders, so this proves nothing");
  assert.equal(sales.some((id) => purchases.includes(id)), false);

  await inRollback(async (c: PoolClient) => {
    const { rows } = await c.query(
      "SELECT direction, count(*)::int n FROM orders.orders WHERE id = ANY($1) GROUP BY 1",
      [sales]
    );
    assert.deepEqual(rows, [{ direction: "sale", n: sales.length }]);
  });
});

test("the money comes back off the transaction, not the order", async () => {
  await inRollback(async (c: PoolClient) => {
    const all = await viewsOf(await saleIds(c));
    assert.ok(all.length, "no sales orders, so this test asserts nothing");
    for (const o of all) {
      const { rows: [t] } = await c.query(
        "SELECT total, items, shipping, surcharge, funds FROM orders.transactions WHERE order_id = $1",
        [o.order.id]
      );
      assert.ok(t, `sales order ${o.order.number} has no transaction row`);
      // The money is orders.transactions VERBATIM, under that table's own
      // names - no renames survived the composer.
      assert.equal(Number(o.totals!.total), Number(t.total));
      assert.equal(Number(o.totals!.items), Number(t.items));
      assert.equal(Number(o.totals!.shipping), Number(t.shipping));
      assert.equal(Number(o.totals!.surcharge), Number(t.surcharge));
      assert.equal(Number(o.totals!.funds), Number(t.funds));
    }
  });
});

// used_funds is a boolean and funds is an amount. They were nearly conflated
// during the backfill - a zero balance applied and no balance applied are
// different things. Both are columns of orders.transactions, and the view
// serves that row rather than lifting one of them onto the order.
test("used_funds stays a boolean beside the funds amount", async () => {
  const all = await viewsOf(await saleIds());
  assert.ok(all.length, "no sales orders, so this test asserts nothing");
  for (const o of all) {
    assert.equal(typeof o.totals!.used_funds, "boolean");
    assert.equal(typeof o.totals!.funds, "number");
  }
});

// THE ADDRESS IS A ROW, NOT AN ID (D214 item 12). The composed order served
// `address_id` - the BOOK entry, read from exchange.addresses - beside a
// projection of it; the view answers the places.addresses snapshot the parcel
// went to, and the link is resolved in the WHERE clause.
test("the address is the snapshot the order links to", async () => {
  await inRollback(async (c: PoolClient) => {
    const { rows: links } = await c.query<{ order_id: string; address_id: string }>(
      `SELECT a.order_id, a.address_id FROM orders.addresses a
         JOIN orders.orders o ON o.id = a.order_id
        WHERE o.direction = 'sale' LIMIT 5`
    );
    assert.ok(links.length, "no sales order has an address, so this proves nothing");
    for (const link of links) {
      const view = await orderRead.view(link.order_id);
      assert.ok(view?.address, `order ${link.order_id} has an address link and no address`);
      assert.equal(view!.address!.id, link.address_id);
    }
  });
});

test("every line resolves to a product", async () => {
  const all = await viewsOf(await saleIds());
  assert.ok(all.length, "no sales orders, so this test asserts nothing");
  let lines = 0;
  for (const o of all) {
    for (const item of o.items) {
      lines += 1;
      assert.ok(item.bullion_id, `line ${item.id} of a sale is not a bullion line`);
      assert.ok(item.product?.id, `line ${item.id} has no product`);
      assert.equal(typeof item.product!.name, "string");
      // THE METAL IS AN ID ON BOTH SIDES. `product.metal_type` was a joined
      // display name the composer added; the client maps it from /spots.
      assert.ok(item.product!.metal_id, "the product names no metal");
      assert.equal(item.metal_id, item.product!.metal_id, "the line and its product disagree");
    }
  }
  // An individual order may legitimately have no lines - that is the itemless
  // case - so the floor is the total across all of them, not one per order.
  assert.ok(lines, "no sales order had a single line, so this test asserts nothing");
});

test("orders come back newest first", async () => {
  const dates = (await orderRead.list({ direction: "sale" })).map((o) =>
    new Date(o.created_at as unknown as string).getTime()
  );
  assert.deepEqual(dates, [...dates].sort((a, b) => b - a));
});

// COUNTED UNDER THE ORDERS LOCK, and that is not caution - it is the fix for a
// real flake. This file declared no lock, so it counted orders.transactions
// across a read while the order-PLACING files were committing rows on their own
// connections: the gate reported 55 !== 56 and the same test passed alone.
test("reads do not write", async () => {
  await inRollback(async (c: PoolClient) => {
    await takeLocks(c, [LOCKS.ORDERS]);
    const before = await c.query("SELECT count(*)::int n FROM orders.transactions");
    await viewsOf(await saleIds(c));
    const after = await c.query("SELECT count(*)::int n FROM orders.transactions");
    assert.equal(after.rows[0].n, before.rows[0].n);
  });
});
