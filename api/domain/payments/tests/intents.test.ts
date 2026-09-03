// WHOSE INTENT IS RECORDED, and whether an open one comes back.
//
// These moved here from the payments repo test when the composite write split
// into per-table repos: recording an intent writes an intents row AND the
// attempt that carries the provider's reference, and only the service spans
// both. No Stripe client is involved - the payload is the handful of fields the
// service reads off one.
import test, { after, before } from "node:test";
import assert from "node:assert/strict";
import type { PoolClient } from "pg";
import { randomUUID } from "node:crypto";
import pool from "#db";
import * as service from "#domain/payments/service.ts";

let client: PoolClient;

before(async () => {
  assert.equal(
    new Date().getTimezoneOffset(), 0,
    "these tests require TZ=UTC - run them with `pnpm --filter @dorado/api test`"
  );
  client = await pool.connect();
});
after(async () => { client.release(); await pool.end(); });

async function inRollback(fn: (c: PoolClient) => Promise<void>) {
  await client.query("BEGIN");
  try { await fn(client); } finally { await client.query("ROLLBACK"); }
}

const users = async (c: PoolClient, n = 1) => {
  const { rows } = await c.query(`SELECT id FROM exchange.users ORDER BY id LIMIT ${n}`);
  assert.ok(rows.length >= n, `the test database needs ${n} users`);
  return rows.map((r) => r.id as string);
};

const aSession = (user_id: string) => ({
  session: { id: randomUUID() },
  user: { id: user_id },
});

const anIntent = () => ({
  id: `pi_${randomUUID().slice(0, 12)}`,
  status: "requires_payment_method",
  amount: 10000,
  amount_received: 0,
});

test("an intent is recorded against the session's user, in dollars", async () => {
  await inRollback(async (c: PoolClient) => {
    const [user] = await users(c);
    const session = aSession(user);
    const paymentIntent = anIntent();

    await service.recordIntent(paymentIntent, "checkout", undefined, session, c);

    const { rows } = await c.query(
      `SELECT i.user_id, i.type, i.status, i.amount_expected
         FROM payments.intents i
         JOIN payments.attempts a ON a.intent_id = i.id
        WHERE a.provider_ref = $1`,
      [paymentIntent.id]
    );
    assert.equal(rows.length, 1, "the intent and its attempt were not both written");
    assert.equal(rows[0].user_id, user);
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
    const [admin, customer] = await users(c, 2);
    const paymentIntent = anIntent();

    await service.recordIntent(paymentIntent, "admin", customer, aSession(admin), c);

    const { rows } = await c.query(
      `SELECT i.user_id FROM payments.intents i
         JOIN payments.attempts a ON a.intent_id = i.id
        WHERE a.provider_ref = $1`,
      [paymentIntent.id]
    );
    assert.equal(rows[0].user_id, customer);
    assert.notEqual(rows[0].user_id, admin);
  });
});

test("what the provider says lands on the intent, the attempt and the settlement", async () => {
  await inRollback(async (c: PoolClient) => {
    const [user] = await users(c);
    const mine = anIntent();
    const mineRef = mine.id;
    const other = anIntent();
    await service.recordIntent(mine, "checkout", undefined, aSession(user), c);
    await service.recordIntent(other, "checkout", undefined, aSession(user), c);

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
    const [user] = await users(c);
    const paymentIntent = anIntent();
    await service.recordIntent(paymentIntent, "checkout", undefined, aSession(user), c);

    const { rows: orders } = await c.query(
      "SELECT id FROM orders.orders WHERE direction = 'sale' ORDER BY id LIMIT 1"
    );
    assert.ok(orders.length, "the test database has no sales order to attach");

    assert.equal(await service.attachOrder(paymentIntent.id, orders[0].id, c), true);
    const attached = await service.findIntentByRef(paymentIntent.id, c);
    assert.equal(attached?.sales_order_id, orders[0].id);

    // Passing null detaches, which is what a superseded checkout does.
    assert.equal(await service.attachOrder(paymentIntent.id, null, c), true);
    assert.equal((await service.findIntentByRef(paymentIntent.id, c))?.sales_order_id, null);

    assert.equal(await service.attachOrder(`pi_${randomUUID()}`, null, c), false);
  });
});
