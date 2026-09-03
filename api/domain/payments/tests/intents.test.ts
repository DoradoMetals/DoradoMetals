// WHOSE INTENT IS RECORDED, and whether an open one comes back.
//
// These moved here from the payments repo test when the composite write split
// into per-table repos: recording an intent writes an intents row AND the
// attempt that carries the provider's reference, and only the service spans
// both. No Stripe client is involved - the payload is the handful of fields the
// service reads off one.
import { test, afterAll, beforeAll } from "vitest";
import assert from "node:assert/strict";
import type { PoolClient } from "pg";
import { randomUUID } from "node:crypto";
import pool from "#db";
import { LOCKS, takeLocks } from "#shared/testing/locks.ts";
import { rollbackIn } from "#shared/testing/rollback.ts";
import { aUser, anOrder } from "#shared/testing/builders/index.ts";
import * as service from "#domain/payments/service.ts";

let client: PoolClient;

beforeAll(async () => {
  assert.equal(
    new Date().getTimezoneOffset(), 0,
    "these tests require TZ=UTC - run them with `pnpm --filter @dorado/api test`"
  );
  client = await pool.connect();
});
afterAll(async () => { client.release(); await pool.end(); });

// LOCKS.ORDERS, transaction-scoped (lane 3, the runner conversion): the last
// test here builds a sale order of its own through `anOrder`, and
// domain/orders/tests/edit-line.test.ts writes real, autocommitting rows to
// the same table under LOCKS.ORDERS - see purchase-read.test.ts's own
// comment for the full mechanism.
// THE FILE'S LOCK, BOUND ONCE. A lock is a property of what this file
// WRITES, not of one call, so it is named here and every inRollback below
// inherits it - which is also what stops a new test being added without one.
const inRollback = rollbackIn({ lock: LOCKS.ORDERS });

// WHO IS ASKING, as the two ids an intent is keyed on. The service takes these
// rather than a session object read out of request headers (D214 item 11).
const aCaller = (user_id: string) => ({ session_id: randomUUID(), user_id });

const anIntent = () => ({
  id: `pi_${randomUUID().slice(0, 12)}`,
  status: "requires_payment_method",
  amount: 10000,
  amount_received: 0,
});

test("an intent is recorded against the session's user, in dollars", async () => {
  await inRollback(async (c: PoolClient) => {
    const user = await aUser(c);
    const caller = aCaller(user.id);
    const paymentIntent = anIntent();

    await service.recordIntent(paymentIntent, caller, "checkout", undefined, c);

    const { rows } = await c.query(
      `SELECT i.user_id, i.type, i.status, i.amount_expected
         FROM payments.intents i
         JOIN payments.attempts a ON a.intent_id = i.id
        WHERE a.provider_ref = $1`,
      [paymentIntent.id]
    );
    assert.equal(rows.length, 1, "the intent and its attempt were not both written");
    assert.equal(rows[0].user_id, user.id);
    assert.equal(rows[0].type, "checkout");
    assert.equal(rows[0].status, paymentIntent.status);
    // Stripe speaks cents; every payments.* column is in dollars.
    assert.equal(Number(rows[0].amount_expected), 100);
  });
});

// An admin taking a payment on a customer's behalf: the intent belongs to the
// CUSTOMER. Getting this backwards files the payment against the wrong person
// and collides the idempotency key across every customer that admin serves.
test("an admin intent is recorded against the customer, not the admin", async () => {
  await inRollback(async (c: PoolClient) => {
    const admin = await aUser(c, { role: "admin" });
    const customer = await aUser(c);
    const paymentIntent = anIntent();

    await service.recordIntent(paymentIntent, aCaller(admin.id), "admin", customer.id, c);

    const { rows } = await c.query(
      `SELECT i.user_id FROM payments.intents i
         JOIN payments.attempts a ON a.intent_id = i.id
        WHERE a.provider_ref = $1`,
      [paymentIntent.id]
    );
    assert.equal(rows[0].user_id, customer.id);
    assert.notEqual(rows[0].user_id, admin.id);
  });
});

test("what the provider says lands on the intent, the attempt and the settlement", async () => {
  await inRollback(async (c: PoolClient) => {
    const user = await aUser(c);
    const mine = anIntent();
    const mineRef = mine.id;
    const other = anIntent();
    await service.recordIntent(mine, aCaller(user.id), "checkout", undefined, c);
    await service.recordIntent(other, aCaller(user.id), "checkout", undefined, c);

    const matched = await service.updateFromProvider(
      { id: mineRef, status: "succeeded", amount: 25000, amount_received: 25000 }, c
    );
    assert.equal(matched, true);

    const { rows: [updated] } = await c.query(
      `SELECT i.status, i.amount_expected, a.status AS attempt_status, st.settled_amount
         FROM payments.intents i
         JOIN payments.attempts a ON a.intent_id = i.id
         LEFT JOIN payments.settlements st ON st.attempt_id = a.id
        WHERE a.provider_ref = $1`,
      [mine.id]
    );
    assert.equal(updated.status, "succeeded");
    assert.equal(updated.attempt_status, "succeeded");
    assert.equal(Number(updated.amount_expected), 250);
    assert.equal(Number(updated.settled_amount), 250);

    const { rows: [untouched] } = await c.query(
      `SELECT i.status, i.amount_expected FROM payments.intents i
         JOIN payments.attempts a ON a.intent_id = i.id
        WHERE a.provider_ref = $1`,
      [other.id]
    );
    assert.equal(untouched.status, "requires_payment_method");
    assert.equal(Number(untouched.amount_expected), 100);
  });
});

test("attaching an order lands on the intent behind that reference alone", async () => {
  await inRollback(async (c: PoolClient) => {
    const user = await aUser(c);
    const paymentIntent = anIntent();
    await service.recordIntent(paymentIntent, aCaller(user.id), "checkout", undefined, c);

    const order = await anOrder(c, user, { direction: "sale" });

    assert.equal(await service.attachOrder(paymentIntent.id, order.id, c), true);
    const attached = await service.findIntentByRef(paymentIntent.id, c);
    assert.equal(attached?.sales_order_id, order.id);

    // Passing null detaches, which is what a superseded checkout does.
    assert.equal(await service.attachOrder(paymentIntent.id, null, c), true);
    assert.equal((await service.findIntentByRef(paymentIntent.id, c))?.sales_order_id, null);

    assert.equal(await service.attachOrder(`pi_${randomUUID()}`, null, c), false);
  });
});

// THE BUG THIS GUARDS AGAINST: createPaymentIntent used to call recordIntent
// with no executor, so recordIntent's own together() had nothing to join and
// opened a FRESH transaction on a SEPARATE pool connection - committing the
// intent and attempt rows on their own, independent of whatever transaction
// the caller was holding. A test calling the service could not see this: it
// reads its own writes either way, which is the exact shape
// audit:test-leaks exists to catch (CLAUDE.md). The only way to tell a joined
// write apart from an independently-committed one is from a THIRD connection:
// a write inside the caller's still-open transaction is invisible everywhere
// else until the caller commits or rolls back; a write on its own connection
// is visible immediately, everywhere, and survives the caller's rollback.
test("recordIntent joins the caller's transaction rather than opening its own", async () => {
  const paymentIntent = anIntent();
  const findBoth = (c: PoolClient) =>
    c.query(
      `SELECT i.id AS intent_id, a.id AS attempt_id
         FROM payments.intents i
         JOIN payments.attempts a ON a.intent_id = i.id
        WHERE a.provider_ref = $1`,
      [paymentIntent.id]
    );

  await inRollback(async (c: PoolClient) => {
    const user = await aUser(c);
    await service.recordIntent(paymentIntent, aCaller(user.id), "checkout", undefined, c);

    // Visible on the connection actually holding the transaction.
    const { rows: seen } = await findBoth(c);
    assert.equal(seen.length, 1, "recordIntent did not write on the caller's own connection");

    // A wholly independent connection must see NOTHING while `c`'s
    // transaction is still open - a joined write is not there to find yet.
    const spectator = await pool.connect();
    try {
      const { rows: hidden } = await findBoth(spectator);
      assert.equal(
        hidden.length, 0,
        "the intent/attempt pair is visible from another connection before the " +
          "caller committed - recordIntent opened its own transaction instead of " +
          "joining the caller's"
      );
    } finally {
      spectator.release();
    }
  });

  // And once the caller rolls back, nothing survives at all: the intent row
  // and its attempt commit together or not at all.
  const { rows: after } = await findBoth(client);
  assert.equal(after.length, 0, "the intent/attempt pair survived the caller's rollback");
});
