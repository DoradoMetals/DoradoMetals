// The writes on refiners.spots, against real Postgres. Two things pinned: both directions use this table (one order id, not a column per kind of order), and there is no UNIQUE (order_id, metal_id) here — why create has no ON CONFLICT (42P10 at runtime otherwise).
import test, { after, before } from "node:test";
import assert from "node:assert/strict";
import type { PoolClient } from "pg";
import { randomUUID } from "node:crypto";
import pool from "#db";
import { LOCKS, takeLocks } from "#shared/testing/locks.ts";
import * as refinerSpots from "#db/refiners/spots/repo.ts";

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

// Takes the orders lock: this table hangs off an order and is written by the order-placing paths too, so it can deadlock against them when interleaved.
async function inRollback(fn: (c: PoolClient) => Promise<void>) {
  await client.query("BEGIN");
  try {
    await takeLocks(client, LOCKS.ORDERS);
    await fn(client);
  } finally {
    await client.query("ROLLBACK");
  }
}

const aRefinerSpot = async (c: PoolClient, direction: string) =>
  (await c.query(
    `SELECT s.order_id, s.metal_id, s.refiner_id
       FROM refiners.spots s
       JOIN orders.orders o ON o.id = s.order_id
      WHERE o.direction = $1
      ORDER BY s.order_id, s.metal_id LIMIT 1`, [direction]
  )).rows[0] ?? null;

test("a refiner bid lands on one metal of one order", async () => {
  await inRollback(async (c: PoolClient) => {
    const s = await aRefinerSpot(c, "purchase");
    assert.ok(s, "no purchase order has a refiner spot - this test proves nothing");
    const { rows: others } = await c.query(
      `SELECT metal_id FROM refiners.spots WHERE order_id = $1 AND metal_id <> $2`,
      [s.order_id, s.metal_id]
    );
    assert.ok(
      others.length > 0,
      "this order has a refiner spot for only one metal, so the loop below would " +
        "assert nothing and the test would pass without proving the update is narrow"
    );
    await c.query("UPDATE refiners.spots SET bid = 1 WHERE order_id = $1", [s.order_id]);

    const changed = await refinerSpots.update(s.order_id, s.metal_id, { bid: 42.5 }, c);
    assert.equal(changed, true, "update reported no row changed");

    const { rows: [after] } = await c.query(
      "SELECT bid FROM refiners.spots WHERE order_id = $1 AND metal_id = $2",
      [s.order_id, s.metal_id]
    );
    assert.equal(Number(after.bid), 42.5);

    for (const other of others) {
      const { rows: [o] } = await c.query(
        "SELECT bid FROM refiners.spots WHERE order_id = $1 AND metal_id = $2",
        [s.order_id, other.metal_id]
      );
      assert.equal(Number(o.bid), 1, "the bid reached another metal on the same order");
    }
  });
});

// A write keyed on the single order id must work for a sales order too — not hypothetical, dev has 60 sales rows.
test("a sales order's refiner spot can be written the same way", async () => {
  await inRollback(async (c: PoolClient) => {
    const s = await aRefinerSpot(c, "sale");
    assert.ok(s, "no sales order has a refiner spot - exchange holds 60 such rows, so this is wrong");

    const changed = await refinerSpots.update(s.order_id, s.metal_id, { bid: 33.25 }, c);
    assert.equal(changed, true, "a sales order's refiner spot could not be written");

    const { rows: [after] } = await c.query(
      "SELECT bid FROM refiners.spots WHERE order_id = $1 AND metal_id = $2",
      [s.order_id, s.metal_id]
    );
    assert.equal(Number(after.bid), 33.25);
  });
});

test("update answers false for a (order, metal) pair with no row", async () => {
  await inRollback(async (c: PoolClient) => {
    const s = await aRefinerSpot(c, "purchase");
    assert.ok(s, "no purchase order has a refiner spot");
    await c.query(
      "DELETE FROM refiners.spots WHERE order_id = $1 AND metal_id = $2",
      [s.order_id, s.metal_id]
    );

    const changed = await refinerSpots.update(s.order_id, s.metal_id, { bid: 5 }, c);
    assert.equal(changed, false, "update reported a change for a pair that does not exist");
  });
});

test("the ask is left alone when the bid is written", async () => {
  await inRollback(async (c: PoolClient) => {
    const s = await aRefinerSpot(c, "purchase");
    assert.ok(s, "no purchase order has a refiner spot");
    await c.query(
      "UPDATE refiners.spots SET ask = 500 WHERE order_id = $1 AND metal_id = $2",
      [s.order_id, s.metal_id]
    );

    await refinerSpots.update(s.order_id, s.metal_id, { bid: 10 }, c);

    const { rows: [row] } = await c.query(
      "SELECT ask FROM refiners.spots WHERE order_id = $1 AND metal_id = $2",
      [s.order_id, s.metal_id]
    );
    assert.equal(Number(row.ask), 500, "writing the bid disturbed the ask");
  });
});

// The condition is CREATED, not found: every order already has all four metals' refiner spots, so the earlier version returned early and asserted nothing — audit:vacuous-tests caught it.
test("a new refiner spot can be created for an order", async () => {
  await inRollback(async (c: PoolClient) => {
    const s = await aRefinerSpot(c, "purchase");
    assert.ok(s, "no purchase order has a refiner spot");

    // Free the pair up inside the transaction this test rolls back.
    await c.query(
      "DELETE FROM refiners.spots WHERE order_id = $1 AND metal_id = $2",
      [s.order_id, s.metal_id]
    );

    const row = await refinerSpots.create(
      { id: randomUUID(), order_id: s.order_id, metal_id: s.metal_id, refiner_id: s.refiner_id, ask: 100, bid: 90 },
      c
    );
    assert.ok(row, "creating a refiner spot for a freed pair returned nothing");
    assert.equal(row.order_id, s.order_id);
    assert.equal(row.metal_id, s.metal_id);
    assert.equal(Number(row.bid), 90);
    assert.equal(Number(row.ask), 100);
  });
});
