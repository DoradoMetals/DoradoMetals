// The writes on refiners.spots, against real Postgres.
//
// The refiner's own quote, which exchange kept in refiner_metals beside our
// quote in order_metals. Two things worth pinning:
//
//   - BOTH DIRECTIONS USE THIS TABLE. exchange had a column per kind of order
//     and dev holds 64 purchase and 60 sales rows; the new schema has one
//     order id, so a write must not assume a purchase order.
//   - THERE IS NO UNIQUE (order_id, metal_id) HERE, where orders.spots has
//     one. That is why create has no ON CONFLICT - naming a target with no
//     matching constraint raises 42P10 at runtime.
//
// Each test runs inside a transaction that is rolled back.
import test, { after, before } from "node:test";
import assert from "node:assert/strict";
import type { PoolClient } from "pg";
import { randomUUID } from "node:crypto";
import pool from "#db";
import { LOCKS, takeLocks } from "#shared/testing/locks.ts";
import * as refinerSpots from "#features/refiners/spots/repo.ts";

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

// TAKES THE ORDERS LOCK, and it earned that the way locks.ts says these are
// always earned: it deadlocked in a full run having passed in isolation every
// time before. This file writes refiners.spots, which hangs off an order and
// is written by the order-placing files too; nothing here changed, the suite
// simply got fast enough (the wire slim took the composed order read off the
// order paths) to interleave differently.
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

    const row = await refinerSpots.setBid(s.order_id, s.metal_id, 42.5, c);

    assert.ok(row, "setBid wrote no row");
    assert.equal(Number(row.bid), 42.5);

    for (const other of others) {
      const { rows: [o] } = await c.query(
        "SELECT bid FROM refiners.spots WHERE order_id = $1 AND metal_id = $2",
        [s.order_id, other.metal_id]
      );
      assert.equal(Number(o.bid), 1, "the bid reached another metal on the same order");
    }
  });
});

// exchange had purchase_order_id and sales_order_id; the new schema has one
// order id. A write keyed on it must work for a sales order too - and dev has
// 60 sales rows, so this is not hypothetical.
test("a sales order's refiner spot can be written the same way", async () => {
  await inRollback(async (c: PoolClient) => {
    const s = await aRefinerSpot(c, "sale");
    assert.ok(s, "no sales order has a refiner spot - exchange holds 60 such rows, so this is wrong");

    const row = await refinerSpots.setBid(s.order_id, s.metal_id, 33.25, c);

    assert.ok(row, "setBid wrote no row");
    assert.ok(row, "a sales order's refiner spot could not be written");
    assert.equal(Number(row.bid), 33.25);
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

    await refinerSpots.setBid(s.order_id, s.metal_id, 10, c);

    const { rows: [row] } = await c.query(
      "SELECT ask FROM refiners.spots WHERE order_id = $1 AND metal_id = $2",
      [s.order_id, s.metal_id]
    );
    assert.equal(Number(row.ask), 500, "writing the bid disturbed the ask");
  });
});

// The condition is CREATED, not found: every order already has a refiner spot
// for all four metals, so the earlier version of this test returned early every
// single time and asserted nothing. audit:vacuous-tests caught it.
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
      randomUUID(), s.order_id, s.metal_id, s.refiner_id, 100, 90, c
    );
    assert.ok(row, "creating a refiner spot for a freed pair returned nothing");
    assert.equal(row.order_id, s.order_id);
    assert.equal(row.metal_id, s.metal_id);
    assert.equal(Number(row.bid), 90);
    assert.equal(Number(row.ask), 100);
  });
});
