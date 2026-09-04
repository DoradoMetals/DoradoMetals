// The writes on orders.items, against real Postgres.
//
// THE FIRST TEST IS THE REASON THIS FILE EXISTS. exchange deleted order lines
// with `WHERE id = ANY($1)` and no order scoping, while both sibling statements
// scoped on the order - and the service computed the order id one line above
// the call, for something else, without passing it. The guard is now in the
// statement AND required by the signature.
//
// A line is not a cheap thing to lose. It carries the scrap weights, the
// purity, and the assay figures recording what was actually recovered from a
// customer's parcel; the purchase-orders service says in its own comment that
// what those rows record "exists nowhere else". So the guard is now in the
// statement AND required by the signature, and this proves it.
//
// Each test runs inside a transaction that is rolled back.
import { test, afterAll, beforeAll } from "vitest";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import type { PoolClient } from "pg";
import pool from "#pool";
import { inRollback } from "#shared/testing/rollback.ts";
import * as items from "#db/orders/items/repo.ts";


beforeAll(async () => {
  assert.equal(
    new Date().getTimezoneOffset(), 0,
    "these tests require TZ=UTC - run them with `pnpm --filter @dorado/api test`"
  );
});

afterAll(async () => {
  await pool.end();
});

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

    // The other order's line, named with MY order id. It must survive: that is
    // the entire guard.
    const wrong = await items.remove(theirs.item_id, mine.order_id, c);
    assert.equal(wrong, false, "the delete reported removing a line it never matched");

    const survivor = await c.query(
      "SELECT id FROM orders.items WHERE id = $1", [theirs.item_id]
    );
    assert.equal(
      survivor.rows.length, 1,
      "a line from another order was deleted - this is the defect the scoping exists to prevent"
    );

    assert.equal(await items.remove(mine.item_id, mine.order_id, c), true);
    const gone = await c.query("SELECT id FROM orders.items WHERE id = $1", [mine.item_id]);
    assert.equal(gone.rows.length, 0, "the line that WAS named survived");
  });
});

// The whole reason update returns a boolean: Postgres does not raise on a
// zero-row UPDATE, so a WHERE that has stopped resolving succeeds forever.
test("update answers false for an id that names nothing and true for a real one", async () => {
  await inRollback(async (c: PoolClient) => {
    assert.equal(
      await items.update(randomUUID(), { premium: 1 }, {}, c), false,
      "an update against no row reported success"
    );

    const pair = await twoOrdersWithItems(c);
    assert.ok(pair, "dev needs two orders with lines");
    assert.equal(await items.update(pair[0].item_id, { premium: 1 }, {}, c), true);
  });
});

test("a price is scoped to its own order too", async () => {
  await inRollback(async (c: PoolClient) => {
    const pair = await twoOrdersWithItems(c);
    assert.ok(pair, "dev needs two orders with lines");
    const [mine, theirs] = pair;

    // The right item, but the WRONG order: it must match nothing.
    const wrong = await items.update(
      theirs.item_id, { price: 123.45 }, { order_id: mine.order_id }, c
    );
    assert.equal(wrong, false, "a price landed on a line from another order");

    const right = await items.update(
      mine.item_id, { price: 123.45 }, { order_id: mine.order_id }, c
    );
    assert.equal(right, true, "the update wrote no row for the line it was given");
    const row = await items.getOne(mine.item_id, c);
    assert.equal(Number(row!.price), 123.45);
  });
});

test("quantity and premium are one patch, and a partial one leaves the rest alone", async () => {
  await inRollback(async (c: PoolClient) => {
    const pair = await twoOrdersWithItems(c);
    assert.ok(pair, "dev needs two orders with lines");
    const id = pair[0].item_id;

    await items.update(id, { quantity: 7, premium: 1.25 }, {}, c);
    const row = await items.getOne(id, c);
    assert.equal(Number(row!.quantity), 7);
    assert.equal(Number(row!.premium), 1.25);

    // A key ABSENT from the patch is not in the SET list at all.
    await items.update(id, { premium: 0.9 }, {}, c);
    const after = await items.getOne(id, c);
    assert.equal(Number(after!.quantity), 7, "an absent key was written anyway");
    assert.equal(Number(after!.premium), 0.9);
  });
});

test("confirming is scoped to the order as well as the id", async () => {
  await inRollback(async (c: PoolClient) => {
    const pair = await twoOrdersWithItems(c);
    assert.ok(pair, "dev needs two orders with lines");
    const [mine, theirs] = pair;
    await c.query("UPDATE orders.items SET confirmed = false WHERE id = ANY($1::uuid[])",
      [[mine.item_id, theirs.item_id]]);

    const wrong = await items.update(
      theirs.item_id, { confirmed: true }, { order_id: mine.order_id }, c
    );
    assert.equal(wrong, false);

    const other = await c.query("SELECT confirmed FROM orders.items WHERE id = $1", [theirs.item_id]);
    assert.equal(other.rows[0].confirmed, false, "another order's line was confirmed");

    assert.equal(
      await items.update(mine.item_id, { confirmed: true }, { order_id: mine.order_id }, c), true
    );
  });
});
