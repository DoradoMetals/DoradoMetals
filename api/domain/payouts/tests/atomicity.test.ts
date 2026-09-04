// PATCH /api/payouts/:id WRITES TWO TABLES, AND THEY COMMIT TOGETHER.
//
// *** WHAT THIS FILE EXISTS FOR. *** The patch used to open a transaction PER
// FIELD: `cost` and `waive_payout_fee` each opened one on orders.transactions
// and `method` a third on payments.details. A document naming the fee and a
// method that does not exist therefore COMMITTED THE FEE and then refused -
// leaving a payout whose recorded charge belonged to an account it no longer
// paid, and an admin who was told the write failed.
//
// One `withTransaction` owns all three writes now (ruling 56: the writers take
// `tx`, only the use case opens one), so a refusal anywhere leaves every
// column as it was.
//
// NOTHING IS COMMITTED: the fixtures are built inside the pinned transaction,
// which is rolled back.
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
    // Waiving does NOT rewrite the stored fee (D117) - it sets a flag the
    // pricing reads, so the record of what the fee would have been survives.
    assert.equal(Number(await feeOf(c, order.id)), 20);
  }, { actor: TEST_ACTOR.id, lock: [LOCKS.ORDERS, LOCKS.USERS] });
});

// The two refusals are different questions and answer differently: 404 for an
// account that is not there, 422 for one that is but pays for nothing.
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
