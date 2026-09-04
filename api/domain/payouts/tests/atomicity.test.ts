import { test, afterAll } from "vitest";
import assert from "node:assert/strict";
import type { PoolClient } from "pg";
import pool from "#pool";
import { patchPayout } from "#domain/payouts/service.ts";
import { inPinnedTransaction } from "#shared/testing/pinned-pool.ts";
import { TEST_ACTOR } from "#shared/testing/actor.ts";
import { LOCKS } from "#shared/testing/locks.ts";
import { aPayout, aUser, anOrder } from "#shared/testing/builders/index.ts";
import query from "#shared/db/query.ts";

afterAll(async () => {
  await pool.end();
});

const feeOf = async (c: PoolClient, order_id: string) =>
  (await query<{ payout_fee: string | null }>(
    `SELECT payout_fee FROM orders.transactions WHERE order_id = $1`, [order_id], c
  )).rows[0]?.payout_fee;

test("a method that does not exist rolls the fee back with it", async () => {
  await inPinnedTransaction(async (c: PoolClient) => {
    const customer = await aUser(c);
    const order = await anOrder(c, customer, { direction: "purchase" });
    const payout = await aPayout(c, customer, { order, payout_fee: 20 });

    await assert.rejects(
      () => patchPayout(payout.id, { cost: 999, method: "NOT_A_METHOD" }),
      /no such payout method/
    );

    assert.equal(
      Number(await feeOf(c, order.id)), 20,
      "the fee committed on its own while the method refused - the writes are not one transaction"
    );
  }, { actor: TEST_ACTOR.id, lock: [LOCKS.ORDERS, LOCKS.USERS] });
});

test("a document naming every field lands all of it", async () => {
  await inPinnedTransaction(async (c: PoolClient) => {
    const customer = await aUser(c);
    const order = await anOrder(c, customer, { direction: "purchase" });
    const payout = await aPayout(c, customer, { order, payout_fee: 0, method: "ACH" });

    const written = await patchPayout(payout.id, {
      cost: 20, method: "WIRE", waive_payout_fee: true,
    });

    assert.equal(Number(written.cost), 20);
    assert.equal(written.method, "WIRE");
    assert.equal(Number(await feeOf(c, order.id)), 20);
  }, { actor: TEST_ACTOR.id, lock: [LOCKS.ORDERS, LOCKS.USERS] });
});

test("a payout attached to no order refuses without writing", async () => {
  await inPinnedTransaction(async (c: PoolClient) => {
    const customer = await aUser(c);
    const payout = await aPayout(c, customer, { order: null });

    await assert.rejects(
      () => patchPayout(payout.id, { cost: 5 }),
      /attached to no order/
    );
  }, { actor: TEST_ACTOR.id, lock: [LOCKS.ORDERS, LOCKS.USERS] });
});
