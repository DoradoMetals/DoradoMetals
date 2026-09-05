import { test, afterAll } from "vitest";
import assert from "node:assert/strict";
import type { PoolClient } from "pg";
import pool from "#pool";
import { inPinnedTransaction } from "#shared/testing/pinned-pool.ts";
import { LOCKS } from "#shared/testing/locks.ts";
import { TEST_ACTOR, actingAs } from "#shared/testing/actor.ts";
import { runWithActor } from "#shared/http/actor.ts";
import {
  aUser, anAdmin, anOrder, aPayout, TEST_ROUTING, TEST_ACCOUNT,
} from "#shared/testing/builders/index.ts";
import * as usersService from "#domain/users/service.ts";
import * as ordersService from "#domain/orders/service.ts";
import * as paymentDetails from "#domain/payments/details/service.ts";
import * as totalsRepo from "#db/orders/transactions/repo.ts";

afterAll(async () => { await pool.end(); });

const MONEY_LOCKS = [LOCKS.ORDERS, LOCKS.USERS];

const stampOf = async (c: PoolClient, table: string, where: string, params: unknown[]) =>
  (await c.query(
    `SELECT created_by_id, updated_by_id, created_by, updated_by
       FROM ${table} WHERE ${where}`, params
  )).rows[0] as Record<string, unknown>;

test("the order and its totals record the admin who placed them", async () => {
  await inPinnedTransaction(async (c: PoolClient) => {
    const admin = await anAdmin(c, { name: "Placing Admin" });
    const customer = await aUser(c);

    await actingAs(c, admin.id);
    const order = await anOrder(c, customer, { direction: "purchase" })
      .withLots(1)
      .withTotals({ total: 1000, shipping: 24.5 });

    const orderStamp = await stampOf(c, "orders.orders", "id = $1", [order.id]);
    assert.equal(orderStamp.created_by_id, admin.id, "orders.orders did not record its author");
    assert.equal(orderStamp.updated_by_id, admin.id);
    assert.equal(orderStamp.created_by, "Placing Admin", "the legacy name column went unfilled");

    const totalsStamp = await stampOf(
      c, "orders.transactions", "order_id = $1", [order.id]
    );
    assert.equal(
      totalsStamp.created_by_id, admin.id,
      "orders.transactions - what an order came to - was written by nobody"
    );
    assert.equal(totalsStamp.created_by, "Placing Admin");
  }, { actor: TEST_ACTOR.id, lock: MONEY_LOCKS });
});

test("a money edit re-attributes the totals without rewriting their author", async () => {
  await inPinnedTransaction(async (c: PoolClient) => {
    const author = await anAdmin(c, { name: "First Admin" });
    const editor = await anAdmin(c, { name: "Second Admin" });
    const customer = await aUser(c);

    await actingAs(c, author.id);
    const order = await anOrder(c, customer, { direction: "purchase" })
      .withLots(1, { price: 100 })
      .withSpots()
      .withTotals({ total: 1000 });

    await actingAs(c, editor.id);
    await totalsRepo.update(order.id, { total: 1250 }, {}, c);

    const stamp = await stampOf(c, "orders.transactions", "order_id = $1", [order.id]);
    assert.equal(stamp.created_by_id, author.id, "the edit rewrote the author");
    assert.equal(stamp.created_by, "First Admin");
    assert.equal(stamp.updated_by_id, editor.id, "the edit was attributed to the wrong person");
    assert.equal(stamp.updated_by, "Second Admin");

    const { rows } = await c.query(
      `SELECT total FROM orders.transactions WHERE order_id = $1`, [order.id]
    );
    assert.equal(Number(rows[0].total), 1250, "the edit did not land");
  }, { actor: TEST_ACTOR.id, lock: MONEY_LOCKS });
});

test("the payout account records the customer who entered it", async () => {
  await inPinnedTransaction(async (c: PoolClient) => {
    const customer = await aUser(c, { name: "Paying Customer" });

    await actingAs(c, customer.id);
    const saved = await paymentDetails.saveCheckoutPayout(
      customer.id,
      null,
      {
        method: "ACH",
        account_holder_name: "Paying Customer",
        bank_name: "Test Bank",
        account_type: "Checking",
        routing_number: TEST_ROUTING,
        account_number: TEST_ACCOUNT,
      },
      c
    );

    const stamp = await stampOf(c, "payments.details", "id = $1", [saved.id]);
    assert.equal(
      stamp.created_by_id, customer.id,
      "payments.details - the sealed bank account - was written by nobody"
    );
    assert.equal(stamp.created_by, "Paying Customer");

    const { rows } = await c.query(
      `SELECT routing_number, account_number, routing_number_encrypted
         FROM payments.details WHERE id = $1`, [saved.id]
    );
    assert.equal(rows[0].routing_number, null);
    assert.equal(rows[0].account_number, null);
    assert.ok(rows[0].routing_number_encrypted?.startsWith("v1."));
  }, { actor: TEST_ACTOR.id, lock: MONEY_LOCKS });
});

test("a credit adjustment writes a stamped ledger row, and the ledger names no author", async () => {
  await inPinnedTransaction(async (c: PoolClient) => {
    const admin = await anAdmin(c, { name: "Crediting Admin" });
    const customer = await aUser(c, { funds: 0 });

    await runWithActor(admin.id, () =>
      usersService.adjustDoradoCredit(customer.id, { op: "add", amount: 500 })
    );

    const { rows } = await c.query(
      `SELECT amount, type, created_at, updated_at FROM payments.ledger WHERE user_id = $1`,
      [customer.id]
    );
    assert.equal(rows.length, 1, "the adjustment wrote no ledger row at all");
    assert.equal(Number(rows[0].amount), 500);
    assert.ok(rows[0].created_at instanceof Date, "the trigger filled no created_at");
    assert.deepEqual(
      rows[0].updated_at, rows[0].created_at,
      "a row that has never been edited must not claim to have been"
    );

    const { rows: cols } = await c.query(
      `SELECT count(*)::int n FROM information_schema.columns
        WHERE table_schema = 'payments' AND table_name = 'ledger'
          AND column_name IN ('created_by', 'created_by_id', 'updated_by', 'updated_by_id')`
    );
    assert.equal(
      cols[0].n, 0,
      "payments.ledger has grown author columns - assert them here instead of this"
    );

    const { rows: balance } = await c.query(
      `SELECT dorado_funds FROM auth.users WHERE id = $1`, [customer.id]
    );
    assert.equal(Number(balance[0].dorado_funds), 500, "the balance did not move");
  }, { actor: TEST_ACTOR.id, lock: MONEY_LOCKS });
});

test("a builder-made payout is stamped by the transaction's actor", async () => {
  await inPinnedTransaction(async (c: PoolClient) => {
    const customer = await aUser(c);
    const payout = await aPayout(c, customer);
    const stamp = await stampOf(c, "payments.details", "id = $1", [payout.id]);
    assert.equal(stamp.created_by_id, TEST_ACTOR.id);
    assert.equal(stamp.created_by, TEST_ACTOR.name);
  }, { actor: TEST_ACTOR.id, lock: MONEY_LOCKS });
});
