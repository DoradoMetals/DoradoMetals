import { test, afterAll, beforeAll } from "vitest";
import assert from "node:assert/strict";
import type { PoolClient } from "pg";
import pool from "#pool";
import { LOCKS } from "#shared/testing/locks.ts";
import { rollbackIn } from "#shared/testing/rollback.ts";
import { aUser, anOrder, metalId } from "#shared/testing/builders/index.ts";
import * as spots from "#db/orders/spots/repo.ts";

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

const anOrderWithSpots = async (c: PoolClient) => {
  const order = await anOrder(c, await aUser(c), { direction: "purchase" }).withSpots();
  return { order_id: order.id, metal_id: await metalId(c, "Gold") };
};

test("clearing a bid leaves the ask alone", async () => {
  await inRollback(async (c: PoolClient) => {
    const s = await anOrderWithSpots(c);
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

test("a bid for a metal the order does not carry changes nothing", async () => {
  await inRollback(async (c: PoolClient) => {
    const s = await anOrderWithSpots(c);

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

test("freezing the same order twice does not raise", async () => {
  await inRollback(async (c: PoolClient) => {
    const order = await anOrder(c, await aUser(c), { direction: "purchase" })
      .withLots(1, { metal: "Gold" });

    const first = await spots.freezeForOrder(order.id, c);
    assert.ok(first.length > 0, "the first freeze wrote no rows");

    const before = (await c.query(
      "SELECT count(*)::int n FROM orders.spots WHERE order_id = $1", [order.id]
    )).rows[0].n;

    const again = await spots.freezeForOrder(order.id, c);
    assert.equal(again.length, 0, "freezing an already-frozen order wrote rows again");

    const after = (await c.query(
      "SELECT count(*)::int n FROM orders.spots WHERE order_id = $1", [order.id]
    )).rows[0].n;
    assert.equal(after, before, "a duplicate freeze added a row");
  });
});
