// THE MONEY ROWS RECORD WHO MOVED THE MONEY.
//
// *** WHY THIS FILE IS SEPARATE FROM audit-stamp.test.ts. *** That file proves
// the MECHANISM - `shared/http/actor.ts` -> `withTransaction`'s set_config ->
// `public.audit_stamp` - using reviews, the smallest table carrying all six
// columns, and says out loud that it is not a fact about reviews. This one asks
// the same question of the four tables where being wrong costs money: the
// order, its totals, the payout account, and the credit ledger.
//
// *** WHY IT IS WORTH ASKING TWICE. *** Migration 116's trigger asks
// pg_attribute which of the six columns each table actually HAS, and the 26
// tables carry six different combinations - `checkout.items` has the text pair
// with no _id sibling, `shipping.packages` types created_by as uuid rather than
// text. So "the trigger works" is a claim per column-shape, not one claim.
// These four are the shapes that matter most, and before lane 2 every one of
// them was exercised by tests that named no actor at all.
//
// The actors are BUILT users rather than invented uuids, for the reason
// audit-stamp.test.ts gives: every *_by_id column is a foreign key to
// auth.users and the trigger resolves the setting against that table first, so
// an unknown id leaves the row unattributed instead of raising - which means a
// broken actor would look like a passing test with NULL columns.
//
// *** TWO WAYS THE ACTOR ARRIVES, AND THE TESTS USE BOTH ON PURPOSE. ***
// `runWithActor` puts an id in an AsyncLocalStorage that only
// `withTransaction` reads - so it reaches the database exactly when a service
// opens its OWN transaction. A write made directly on the pinned client
// (a repo call, or a service handed an executor) never passes through
// withTransaction, so for those the actor is set on the connection with
// `actingAs`. Getting this backwards produces a green-looking test whose rows
// are all stamped by the harness default, which is what the first draft of
// this file did.
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
import * as payoutDetails from "#domain/payments/details/service.ts";
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

    // The builders write on the pinned client, so the actor goes on the
    // connection rather than into the AsyncLocalStorage.
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

// A MONEY EDIT IS A DIFFERENT PERSON FROM THE AUTHOR, and that is the whole
// value of updated_by_id: an order placed by one admin and repriced by another
// must name both.
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

// payments.details holds the bank account. The row is written by the customer
// at the payout step, so THE CUSTOMER is who it must name - not whichever
// admin last touched the order.
test("the payout account records the customer who entered it", async () => {
  await inPinnedTransaction(async (c: PoolClient) => {
    const customer = await aUser(c, { name: "Paying Customer" });

    // The service is HANDED THE EXECUTOR, so it writes on this connection and
    // opens no transaction of its own - `actingAs`, not `runWithActor`.
    await actingAs(c, customer.id);
    const saved = await payoutDetails.saveCheckoutPayout(
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

    // AND THE NUMBERS ARE STILL SEALED. Asserted beside the stamp because the
    // two are properties of the same write, and an audit column is not worth
    // trading a plaintext column for.
    const { rows } = await c.query(
      `SELECT routing_number, account_number, routing_number_encrypted
         FROM payments.details WHERE id = $1`, [saved.id]
    );
    assert.equal(rows[0].routing_number, null);
    assert.equal(rows[0].account_number, null);
    assert.ok(rows[0].routing_number_encrypted?.startsWith("v1."));
  }, { actor: TEST_ACTOR.id, lock: MONEY_LOCKS });
});

// payments.ledger is the record of WHY a balance moved, and it is where the
// stamp goes THROUGH A SERVICE'S OWN TRANSACTION: adjustDoradoCredit takes no
// executor (the row lock is the point), so its withTransaction reads the
// AsyncLocalStorage and `runWithActor` is the right half of the seam here.
//
// *** AND payments.ledger CARRIES NO AUTHOR COLUMNS, WHICH IS A FINDING. ***
// Migration 116 stamps it, but the table has only created_at and updated_at -
// no created_by / created_by_id pair - so the trigger fills the timestamps and
// there is nowhere to record WHO. That is the one money table where an
// adjustment cannot be attributed, and this test pins the fact rather than
// asserting a column that does not exist. Widening it is a migration and
// Jacob's call; asserting it here would just be red.
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

// The builder's own payout goes through the repo, so it is stamped by whoever
// the transaction says is acting - which is what makes every OTHER test's
// fixtures attributable too.
test("a builder-made payout is stamped by the transaction's actor", async () => {
  await inPinnedTransaction(async (c: PoolClient) => {
    const customer = await aUser(c);
    const payout = await aPayout(c, customer);
    const stamp = await stampOf(c, "payments.details", "id = $1", [payout.id]);
    assert.equal(stamp.created_by_id, TEST_ACTOR.id);
    assert.equal(stamp.created_by, TEST_ACTOR.name);
  }, { actor: TEST_ACTOR.id, lock: MONEY_LOCKS });
});
