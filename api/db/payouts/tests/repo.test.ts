import { test, afterAll, beforeAll } from "vitest";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import type { PoolClient } from "pg";
import pool from "#pool";
import { LOCKS } from "#shared/testing/locks.ts";
import { rollbackIn } from "#shared/testing/rollback.ts";
import { aUser, anOrder, aPayout } from "#shared/testing/builders/index.ts";
import * as payouts from "#db/payouts/repo.ts";

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

test("getFor answers the order's payout, last four only, never the full numbers", async () => {
  await inRollback(async (c: PoolClient) => {
    const user = await aUser(c);
    const order = await anOrder(c, user, { direction: "purchase" });
    const built = await aPayout(c, user, { order, method: "ACH", payout_fee: 12.5 });

    const row = await payouts.getFor(order.id, c);
    assert.equal(row?.id, built.id);
    assert.equal(row?.order_id, order.id);
    assert.equal(row?.method, "ACH");
    assert.equal(row?.account_last4, built.last_four);
    assert.equal(Number(row?.cost), 12.5);

    assert.ok(!("account_number" in (row as object)), "the full account number reached the row");
    assert.ok(!("routing_number" in (row as object)), "the full routing number reached the row");
  });
});

test("getFor answers undefined for an order with no payout account", async () => {
  await inRollback(async (c: PoolClient) => {
    const user = await aUser(c);
    const order = await anOrder(c, user, { direction: "purchase" });

    assert.equal(await payouts.getFor(order.id, c), undefined);
  });
});

test("getById resolves the payout by its own id, distinct from the order id", async () => {
  await inRollback(async (c: PoolClient) => {
    const user = await aUser(c);
    const order = await anOrder(c, user, { direction: "purchase" });
    const built = await aPayout(c, user, { order });

    const row = await payouts.getById(built.id, c);
    assert.equal(row?.id, built.id);
    assert.equal(row?.order_id, order.id);

    assert.equal(await payouts.getById(randomUUID(), c), undefined);
  });
});

test("getMany batches several orders' payouts in one read, and answers empty for an empty list", async () => {
  await inRollback(async (c: PoolClient) => {
    const user = await aUser(c);
    const first = await anOrder(c, user, { direction: "purchase" });
    const second = await anOrder(c, user, { direction: "purchase" });
    const firstPayout = await aPayout(c, user, { order: first });
    const secondPayout = await aPayout(c, user, { order: second });

    const rows = await payouts.getMany([first.id, second.id], c);
    const ids = rows.map((r) => r.id).sort();
    assert.deepEqual(ids, [firstPayout.id, secondPayout.id].sort());

    assert.deepEqual(await payouts.getMany([], c), []);
  });
});
