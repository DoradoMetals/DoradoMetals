// The writes on orders.spots, against real Postgres.
//
// exchange.order_metals named the metal as TEXT and had a column per kind of
// order; orders.spots has one order id and a foreign key. Three things this
// pins that a straight translation would lose:
//
//   - THE PATCH TOUCHES THE BID ONLY. We bid to buy from the customer; the ask
//     is what the same metal sells for. Writing both would lose a number this
//     write never owned, so `bid` is the only patchable column.
//   - CREATE IS IDEMPOTENT. (order_id, metal_id) is UNIQUE and exchange's
//     insert had no conflict handling, so a re-run raised.
//   - ONE UPDATE, KEYED ON (order_id, metal_id). The per-row loop is the
//     caller's job; a pair the order does not carry answers false.
//
// Each test runs inside a transaction that is rolled back.
import { test, afterAll, beforeAll } from "vitest";
import assert from "node:assert/strict";
import type { PoolClient } from "pg";
import pool from "#db";
import { LOCKS } from "#shared/testing/locks.ts";
import { rollbackIn } from "#shared/testing/rollback.ts";
import { aUser, anOrder, metalId } from "#shared/testing/builders/index.ts";
import * as spots from "#db/orders/spots/repo.ts";

// LOCKS.ORDERS: the order and its quote are built here rather than borrowed.
const inRollback = rollbackIn({ lock: LOCKS.ORDERS });


beforeAll(async () => {
  assert.equal(
    new Date().getTimezoneOffset(), 0,
    "these tests require TZ=UTC - run them with `pnpm --filter @dorado/api test`"
  );
});

afterAll(async () => {
  await pool.end();
});

// AN ORDER QUOTED FOR EVERY METAL, BUILT. `.withSpots()` writes all four,
// which is what placement does - so "another metal on the same order" is a
// guarantee here rather than something the previous version had to look for
// and assert it had found.
const anOrderWithSpots = async (c: PoolClient) => {
  const order = await anOrder(c, await aUser(c), { direction: "purchase" }).withSpots();
  return { order_id: order.id, metal_id: await metalId(c, "Gold") };
};

test("clearing a bid leaves the ask alone", async () => {
  await inRollback(async (c: PoolClient) => {
    const s = await anOrderWithSpots(c);
    // Both set, so the assertion can tell them apart.
    await c.query(
      "UPDATE orders.spots SET bid = 100, ask = 200 WHERE order_id = $1", [s.order_id]
    );

    for (const row of (await spots.getRowsFor(s.order_id, c))) {
      await spots.update(s.order_id, row.metal_id, { bid: null }, c);
    }

    const { rows } = await c.query(
      "SELECT bid, ask FROM orders.spots WHERE order_id = $1", [s.order_id]
    );
    assert.ok(rows.length > 0, "the fixture order has no spot rows");
    for (const row of rows) {
      assert.equal(row.bid, null, "the bid was not cleared");
      assert.equal(
        Number(row.ask), 200,
        "clearing the bid also cleared the ask - they are different numbers"
      );
    }
  });
});

test("a bid lands on one metal of one order", async () => {
  await inRollback(async (c: PoolClient) => {
    const s = await anOrderWithSpots(c);
    // Another metal on the same order, so we can prove the update is narrow.
    const { rows: others } = await c.query(
      `SELECT metal_id FROM orders.spots WHERE order_id = $1 AND metal_id <> $2`,
      [s.order_id, s.metal_id]
    );
    assert.ok(
      others.length > 0,
      "this order is quoted for only one metal, so the loop below would assert " +
        "nothing and the test would pass without proving the update is narrow"
    );
    await c.query("UPDATE orders.spots SET bid = 1 WHERE order_id = $1", [s.order_id]);

    assert.equal(await spots.update(s.order_id, s.metal_id, { bid: 55.5 }, c), true);
    const { rows: [written] } = await c.query(
      "SELECT bid FROM orders.spots WHERE order_id = $1 AND metal_id = $2",
      [s.order_id, s.metal_id]
    );
    assert.equal(Number(written.bid), 55.5);

    for (const other of others) {
      const { rows: [o] } = await c.query(
        "SELECT bid FROM orders.spots WHERE order_id = $1 AND metal_id = $2",
        [s.order_id, other.metal_id]
      );
      assert.equal(Number(o.bid), 1, "the bid reached another metal on the same order");
    }
  });
});

// EVERY ORDER CARRIES EVERY METAL, so this condition has to be created rather
// than found: there are four metals and insertOrderMetals quotes all four, so
// no existing order is missing one. The delete happens inside the transaction
// this test rolls back.
//
// The first version of this test looked for an unquoted metal and returned
// early when it found none - which was ALWAYS, so it asserted nothing and
// passed for its whole life. audit:vacuous-tests caught it.
test("a bid for a metal the order does not carry changes nothing", async () => {
  await inRollback(async (c: PoolClient) => {
    const s = await anOrderWithSpots(c);

    // Remove one metal's quote, so the order genuinely does not carry it.
    await c.query(
      "DELETE FROM orders.spots WHERE order_id = $1 AND metal_id = $2",
      [s.order_id, s.metal_id]
    );

    assert.equal(
      await spots.update(s.order_id, s.metal_id, { bid: 77 }, c), false,
      "a bid was written for a metal the order was never quoted"
    );
    const { rows } = await c.query(
      "SELECT id FROM orders.spots WHERE order_id = $1 AND metal_id = $2",
      [s.order_id, s.metal_id]
    );
    assert.equal(rows.length, 0, "the update inserted a row rather than matching none");
  });
});

test("creating the same order and metal twice does not raise", async () => {
  await inRollback(async (c: PoolClient) => {
    const s = await anOrderWithSpots(c);
    const before = (await c.query(
      "SELECT count(*)::int n FROM orders.spots WHERE order_id = $1", [s.order_id]
    )).rows[0].n;

    // The pair already exists, so this must be a no-op rather than a 23505.
    const again = await spots.create({ order_id: s.order_id, metal_id: s.metal_id, ask: 10, bid: 20 }, c);
    assert.equal(again, undefined, "a duplicate pair reported a row as written");

    const after = (await c.query(
      "SELECT count(*)::int n FROM orders.spots WHERE order_id = $1", [s.order_id]
    )).rows[0].n;
    assert.equal(after, before, "a duplicate insert added a row");
  });
});
