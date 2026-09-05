import { test, afterAll, beforeAll } from "vitest";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import type { PoolClient } from "pg";
import pool from "#pool";
import { LOCKS } from "#shared/testing/locks.ts";
import { rollbackIn } from "#shared/testing/rollback.ts";
import { aUser, anOrder } from "#shared/testing/builders/index.ts";
import * as totals from "#db/orders/transactions/repo.ts";

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

const anOrderWithTotals = async (c: PoolClient, direction: "purchase" | "sale") =>
  (await anOrder(c, await aUser(c), { direction }).withTotals({ total: 0 })).id;

test("update answers false for an order with no row and true for a real one", async () => {
  await inRollback(async (c: PoolClient) => {
    assert.equal(
      await totals.update(randomUUID(), { total: 1 }, {}, c), false,
      "an update against no orders.transactions row reported success"
    );

    const orderId = await anOrderWithTotals(c, "purchase");
    assert.equal(await totals.update(orderId, { total: 1 }, {}, c), true);
  });
});

test("null is a real value: clearing a total is not the same as omitting it", async () => {
  await inRollback(async (c: PoolClient) => {
    const orderId = await anOrderWithTotals(c, "purchase");

    await totals.update(orderId, { total: 42, payout_fee: 7 }, {}, c);
    await totals.update(orderId, { total: null }, {}, c);

    const row = await totals.getFor(orderId, c);
    assert.equal(row!.total, null, "an explicit null did not clear the column");
    assert.equal(Number(row!.payout_fee), 7, "an absent key was written anyway");
  });
});

test("the direction guard refuses a sale and lets a purchase through", async () => {
  await inRollback(async (c: PoolClient) => {
    const sale = await anOrderWithTotals(c, "sale");
    const purchase = await anOrderWithTotals(c, "purchase");
    assert.ok(sale, "no sales order has a transactions row - this test proves nothing");
    assert.ok(purchase, "no purchase order has a transactions row");

    assert.equal(
      await totals.update(sale, { waive_payout_fee: true }, { direction: "purchase" }, c), false,
      "a payout-fee waiver landed on a sales order"
    );
    assert.equal(
      await totals.update(purchase, { waive_payout_fee: true }, { direction: "purchase" }, c), true
    );
  });
});

test("an empty patch changes nothing and is not a failure", async () => {
  await inRollback(async (c: PoolClient) => {
    const orderId = await anOrderWithTotals(c, "purchase");
    assert.equal(await totals.update(orderId, {}, {}, c), true);
  });
});

test("getMany answers the rows that exist and skips ids with none", async () => {
  await inRollback(async (c: PoolClient) => {
    const orderId = await anOrderWithTotals(c, "purchase");
    await totals.update(orderId, { total: 55 }, {}, c);

    const rows = await totals.getMany([orderId, randomUUID()], c);
    assert.equal(rows.length, 1, "getMany answered an id with no orders.transactions row");
    assert.equal(rows[0]?.order_id, orderId);
    assert.equal(Number(rows[0]?.total), 55);

    assert.deepEqual(await totals.getMany([], c), []);
  });
});
