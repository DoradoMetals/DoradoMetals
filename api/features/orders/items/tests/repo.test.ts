// The writes on orders.items, against real Postgres.
//
// THE FIRST TEST IS THE REASON THIS FILE EXISTS. exchange deleted order lines
// with `WHERE id = ANY($1)` and no order scoping, while both sibling statements
// scoped on the order - and the service computed the order id one line above
// the call, for something else, without passing it.
//
// A line is not a cheap thing to lose. It carries the scrap weights, the
// purity, and the assay figures recording what was actually recovered from a
// customer's parcel; the purchase-orders service says in its own comment that
// what those rows record "exists nowhere else". So the guard is now in the
// statement AND required by the signature, and this proves it.
//
// Each test runs inside a transaction that is rolled back.
import test, { after, before } from "node:test";
import assert from "node:assert/strict";
import type { PoolClient } from "pg";
import pool from "#db";
import * as items from "#features/orders/items/repo.ts";

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

// Two DIFFERENT orders that each have at least one line. Without two, the
// cross-order test cannot distinguish a scoped delete from an unscoped one.
const twoOrdersWithItems = async (c: PoolClient) => {
  const { rows } = await c.query(
    `SELECT order_id, min(id::text) AS item_id, count(*)::int n
       FROM orders.items GROUP BY order_id HAVING count(*) > 0
      ORDER BY order_id LIMIT 2`
  );
  return rows.length === 2 ? rows : null;
};

test("a delete cannot reach a line belonging to another order", async () => {
  await inRollback(async (c: PoolClient) => {
    const pair = await twoOrdersWithItems(c);
    assert.ok(
      pair,
      "dev needs two orders with lines for this test to mean anything - " +
        "with one, a scoped and an unscoped delete behave identically"
    );
    const [mine, theirs] = pair;

    // Ask to delete BOTH ids, but name only the first order. The second line
    // must survive: that is the entire guard.
    const deleted = await items.removeFromOrder(
      mine.order_id, [mine.item_id, theirs.item_id], c
    );

    assert.deepEqual(deleted, [mine.item_id], "the delete returned a line it should not have touched");

    const survivor = await c.query(
      "SELECT id FROM orders.items WHERE id = $1", [theirs.item_id]
    );
    assert.equal(
      survivor.rows.length, 1,
      "a line from another order was deleted - this is the defect the scoping exists to prevent"
    );

    const gone = await c.query("SELECT id FROM orders.items WHERE id = $1", [mine.item_id]);
    assert.equal(gone.rows.length, 0, "the line that WAS named survived");
  });
});

test("deleting nothing deletes nothing", async () => {
  await inRollback(async (c: PoolClient) => {
    const pair = await twoOrdersWithItems(c);
    assert.ok(pair, "dev needs two orders with lines");
    const before = (await c.query("SELECT count(*)::int n FROM orders.items")).rows[0].n;

    assert.deepEqual(await items.removeFromOrder(pair[0].order_id, [], c), []);

    const after = (await c.query("SELECT count(*)::int n FROM orders.items")).rows[0].n;
    assert.equal(after, before, "an empty id list deleted rows");
  });
});

test("a price is scoped to its own order too", async () => {
  await inRollback(async (c: PoolClient) => {
    const pair = await twoOrdersWithItems(c);
    assert.ok(pair, "dev needs two orders with lines");
    const [mine, theirs] = pair;

    // The right item, but the WRONG order: it must match nothing.
    const wrong = await items.setPrice(theirs.item_id, mine.order_id, 123.45, c);
    assert.equal(wrong, undefined, "a price landed on a line from another order");

    const right = await items.setPrice(mine.item_id, mine.order_id, 123.45, c);
    assert.ok(right, "setPrice wrote no row for the line it was given");
    assert.equal(Number(right.price), 123.45);
  });
});

test("clearing prices empties that order and no other", async () => {
  await inRollback(async (c: PoolClient) => {
    const pair = await twoOrdersWithItems(c);
    assert.ok(pair, "dev needs two orders with lines");
    const [mine, theirs] = pair;
    await c.query("UPDATE orders.items SET price = 5 WHERE order_id = ANY($1::uuid[])",
      [[mine.order_id, theirs.order_id]]);

    await items.clearPrices(mine.order_id, c);

    const stillPriced = await c.query(
      "SELECT count(*)::int n FROM orders.items WHERE order_id = $1 AND price IS NOT NULL",
      [theirs.order_id]
    );
    assert.ok(stillPriced.rows[0].n > 0, "clearing one order's prices cleared another's");
    const cleared = await c.query(
      "SELECT count(*)::int n FROM orders.items WHERE order_id = $1 AND price IS NOT NULL",
      [mine.order_id]
    );
    assert.equal(cleared.rows[0].n, 0, "the named order still has prices");
  });
});

test("confirming is scoped to the order as well as the ids", async () => {
  await inRollback(async (c: PoolClient) => {
    const pair = await twoOrdersWithItems(c);
    assert.ok(pair, "dev needs two orders with lines");
    const [mine, theirs] = pair;
    await c.query("UPDATE orders.items SET confirmed = false WHERE id = ANY($1::uuid[])",
      [[mine.item_id, theirs.item_id]]);

    const touched = await items.setConfirmed(mine.order_id, [mine.item_id, theirs.item_id], true, c);
    assert.deepEqual(touched, [mine.item_id]);

    const other = await c.query("SELECT confirmed FROM orders.items WHERE id = $1", [theirs.item_id]);
    assert.equal(other.rows[0].confirmed, false, "another order's line was confirmed");
  });
});

test("quantity and premium can be edited together", async () => {
  await inRollback(async (c: PoolClient) => {
    const pair = await twoOrdersWithItems(c);
    assert.ok(pair, "dev needs two orders with lines");
    const id = pair[0].item_id;

    await items.setBullion(id, 7, 1.25, c);
    const { rows: [row] } = await c.query(
      "SELECT quantity, premium FROM orders.items WHERE id = $1", [id]
    );
    assert.equal(Number(row.quantity), 7);
    assert.equal(Number(row.premium), 1.25);

    // And the premium alone, without disturbing the quantity.
    await items.setPremium(id, 0.9, c);
    const { rows: [after] } = await c.query(
      "SELECT quantity, premium FROM orders.items WHERE id = $1", [id]
    );
    assert.equal(Number(after.quantity), 7, "setting the premium changed the quantity");
    assert.equal(Number(after.premium), 0.9);
  });
});
