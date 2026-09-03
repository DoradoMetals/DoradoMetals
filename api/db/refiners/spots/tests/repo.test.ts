// The writes on refiners.spots, against real Postgres. Two things pinned: both directions use this table (one order id, not a column per kind of order), and there is no UNIQUE (order_id, metal_id) here — why create has no ON CONFLICT (42P10 at runtime otherwise).
import { test, afterAll, beforeAll } from "vitest";
import assert from "node:assert/strict";
import type { PoolClient } from "pg";
import { randomUUID } from "node:crypto";
import pool from "#db";
import { LOCKS, takeLocks } from "#shared/testing/locks.ts";
import { rollbackIn } from "#shared/testing/rollback.ts";
import {
  aUser, anOrder, aRefinerEngagement, metalId,
} from "#shared/testing/builders/index.ts";
import * as refinerSpots from "#db/refiners/spots/repo.ts";


beforeAll(async () => {
  assert.equal(
    new Date().getTimezoneOffset(), 0,
    "these tests require TZ=UTC - run them with `pnpm --filter @dorado/api test`"
  );
});

afterAll(async () => {
  await pool.end();
});

// Takes the orders lock: this table hangs off an order and is written by the order-placing paths too, so it can deadlock against them when interleaved.
// THE FILE'S LOCK, BOUND ONCE. A lock is a property of what this file
// WRITES, not of one call, so it is named here and every inRollback below
// inherits it - which is also what stops a new test being added without one.
const inRollback = rollbackIn({ lock: LOCKS.ORDERS });

// A REFINER SPOT ON AN ORDER OF THE GIVEN DIRECTION, BUILT. The direction was
// always the point - "a write keyed on the single order id must work for a
// sales order too" - and it stays; what changes is that TWO metals are quoted
// on purpose, because the narrowness assertion needs a second one and the
// previous version had to look for one and assert it had found it.
const aRefinerSpot = async (c: PoolClient, direction: "purchase" | "sale") => {
  const order = await anOrder(c, await aUser(c), { direction })
    .withLots(1, { metal: "Gold" })
    .withLots(1, { metal: "Silver" });
  const engagement = await aRefinerEngagement(c, order);
  return {
    order_id: order.id,
    metal_id: await metalId(c, "Gold"),
    refiner_order_id: engagement.id,
    refiner_id: null as string | null,
  };
};

test("a refiner bid lands on one metal of one order", async () => {
  await inRollback(async (c: PoolClient) => {
    const s = await aRefinerSpot(c, "purchase");
    const { rows: others } = await c.query(
      `SELECT metal_id FROM refiners.spots WHERE order_id = $1 AND metal_id <> $2`,
      [s.order_id, s.metal_id]
    );
    assert.ok(others.length > 0, "the fixture quoted only one metal");
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

    // Free the pair up inside the transaction this test rolls back.
    await c.query(
      "DELETE FROM refiners.spots WHERE order_id = $1 AND metal_id = $2",
      [s.order_id, s.metal_id]
    );

    const row = await refinerSpots.create(
      {
        id: randomUUID(), order_id: s.order_id, refiner_order_id: s.refiner_order_id,
        metal_id: s.metal_id, refiner_id: s.refiner_id, ask: 100, bid: 90,
      },
      c
    );
    assert.ok(row, "creating a refiner spot for a freed pair returned nothing");
    assert.equal(row.order_id, s.order_id);
    assert.equal(row.metal_id, s.metal_id);
    assert.equal(Number(row.bid), 90);
    assert.equal(Number(row.ask), 100);
  });
});
