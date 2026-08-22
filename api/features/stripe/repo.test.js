// The Stripe repo, against real Postgres.
//
// This file talks to the database only - there is no Stripe client in it, and
// these tests never touch the network. What is being checked is the bookkeeping
// around a payment: which user an intent is recorded against, and which intents
// are considered reusable.
//
// That second one is the important one. retrievePaymentIntent is what decides
// whether to reuse an existing intent rather than create a new one, and reusing
// a settled intent is how a customer gets charged twice.
import test, { after, before } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import pool from "#db";
import * as repo from "#features/stripe/repo.js";

let client;

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

async function inRollback(fn) {
  await client.query("BEGIN");
  try {
    await fn(client);
  } finally {
    await client.query("ROLLBACK");
  }
}

// Every fixture gets its own session row, so nothing another test file commits
// can be mistaken for one of these intents.
//
// It has to be a real row: payment_intents.session_id is a uuid with a foreign
// key to exchange.session, so neither a prefixed string nor a bare uuid will do.
// Created inside the caller's transaction and rolled back with everything else.
const aSession = async (c, userId) => {
  const { rows: [row] } = await c.query(
    `INSERT INTO exchange.session (id, "userId", token, "expiresAt")
     VALUES (gen_random_uuid(), $1, $2, now() + interval '1 day')
     RETURNING id`,
    [userId, `test-${randomUUID()}`]
  );
  return row.id;
};

const aUser = async (c) =>
  (await c.query("SELECT id FROM exchange.users ORDER BY id LIMIT 1")).rows[0].id;

const intent = (over = {}) => ({
  id: `pi_${randomUUID().slice(0, 12)}`,
  status: "requires_payment_method",
  amount: 10000,
  amount_received: 0,
  amount_capturable: 0,
  payment_method: null,
  ...over,
});

test("an intent is recorded against the session's user", async () => {
  await inRollback(async (c) => {
    const user = await aUser(c);
    const session = { session: { id: await aSession(c, user) }, user: { id: user } };
    const pi = intent();

    await repo.createPaymentIntent(pi, "checkout", null, session, c);

    const { rows } = await c.query(
      "SELECT user_id, type, payment_status FROM exchange.payment_intents WHERE payment_intent_id = $1",
      [pi.id]
    );
    assert.equal(rows.length, 1);
    assert.equal(rows[0].user_id, user);
    assert.equal(rows[0].type, "checkout");
    assert.equal(rows[0].payment_status, pi.status);
  });
});

// An admin taking a payment on a customer's behalf: the intent belongs to the
// customer, not to the admin whose session it is. Getting this backwards would
// file the payment against the wrong person.
test("an admin intent is recorded against the customer, not the admin", async () => {
  await inRollback(async (c) => {
    const { rows: users } = await c.query("SELECT id FROM exchange.users ORDER BY id LIMIT 2");
    if (users.length < 2) return;
    const [admin, customer] = users.map((u) => u.id);
    const session = { session: { id: await aSession(c, admin) }, user: { id: admin } };
    const pi = intent();

    await repo.createPaymentIntent(pi, "admin", customer, session, c);

    const { rows } = await c.query(
      "SELECT user_id FROM exchange.payment_intents WHERE payment_intent_id = $1", [pi.id]
    );
    assert.equal(rows[0].user_id, customer);
    assert.notEqual(rows[0].user_id, admin);
  });
});

test("an open intent is found again for the same session, user and type", async () => {
  await inRollback(async (c) => {
    const user = await aUser(c);
    const session = { session: { id: await aSession(c, user) }, user: { id: user } };
    const pi = intent();
    await repo.createPaymentIntent(pi, "checkout", null, session, c);

    const found = await repo.retrievePaymentIntent("checkout", session, null, c);
    assert.equal(found?.payment_intent_id, pi.id);
  });
});

// The filter that stops a customer being charged twice. An intent that has
// already succeeded, is processing, or was cancelled must never come back as
// reusable - the caller would hand it to Stripe again.
for (const status of ["succeeded", "processing", "canceled"]) {
  test(`an intent that is ${status} is not offered for reuse`, async () => {
    await inRollback(async (c) => {
      const user = await aUser(c);
      const session = { session: { id: await aSession(c, user) }, user: { id: user } };
      await repo.createPaymentIntent(intent({ status }), "checkout", null, session, c);

      const found = await repo.retrievePaymentIntent("checkout", session, null, c);
      assert.equal(found, undefined, `a ${status} intent was offered for reuse`);
    });
  });
}

test("an intent for a different type is not reused", async () => {
  await inRollback(async (c) => {
    const user = await aUser(c);
    const session = { session: { id: await aSession(c, user) }, user: { id: user } };
    await repo.createPaymentIntent(intent(), "checkout", null, session, c);

    assert.equal(await repo.retrievePaymentIntent("admin", session, user, c), undefined);
  });
});

test("an update lands on the named intent and no other", async () => {
  await inRollback(async (c) => {
    const user = await aUser(c);
    const session = { session: { id: await aSession(c, user) }, user: { id: user } };
    const mine = intent();
    const other = intent();
    await repo.createPaymentIntent(mine, "checkout", null, session, c);
    await repo.createPaymentIntent(other, "checkout", null, session, c);

    await repo.updatePaymentIntent(
      { ...mine, status: "succeeded", amount: 25000, amount_received: 25000, amount_capturable: 0 },
      c
    );

    const { rows: [updated] } = await c.query(
      "SELECT payment_status, amount, amount_received FROM exchange.payment_intents WHERE payment_intent_id = $1",
      [mine.id]
    );
    const { rows: [untouched] } = await c.query(
      "SELECT payment_status, amount FROM exchange.payment_intents WHERE payment_intent_id = $1",
      [other.id]
    );
    assert.equal(updated.payment_status, "succeeded");
    assert.equal(Number(updated.amount), 25000);
    assert.equal(Number(updated.amount_received), 25000);
    assert.equal(untouched.payment_status, "requires_payment_method");
    // createPaymentIntent does not record an amount - it inserts only the
    // session, user, type, status and Stripe id. The amount first appears on
    // update, so an intent that is created and never updated has none.
    assert.equal(untouched.amount, null);
  });
});

test("attaching a Stripe customer sets it on that user alone", async () => {
  await inRollback(async (c) => {
    const { rows: users } = await c.query("SELECT id FROM exchange.users ORDER BY id LIMIT 2");
    const [target, bystander] = users.map((u) => u.id);
    const before = (await c.query(
      'SELECT "stripeCustomerId" AS c FROM exchange.users WHERE id = $1', [bystander]
    )).rows[0].c;

    const customerId = `cus_${randomUUID().slice(0, 10)}`;
    await repo.attachCustomerToUser(customerId, target, c);

    const { rows: [t] } = await c.query('SELECT "stripeCustomerId" AS c FROM exchange.users WHERE id = $1', [target]);
    const { rows: [b] } = await c.query('SELECT "stripeCustomerId" AS c FROM exchange.users WHERE id = $1', [bystander]);
    assert.equal(t.c, customerId);
    assert.equal(b.c, before, "another user's Stripe customer was changed");
  });
});

test("a payment write on a client is invisible on another connection", async () => {
  const other = await pool.connect();
  await client.query("BEGIN");
  try {
    const user = await aUser(client);
    const session = { session: { id: await aSession(client, user) }, user: { id: user } };
    const pi = intent();
    await repo.createPaymentIntent(pi, "checkout", null, session, client);

    const inside = await client.query(
      "SELECT 1 FROM exchange.payment_intents WHERE payment_intent_id = $1", [pi.id]
    );
    assert.equal(inside.rows.length, 1, "the write did not happen at all");

    const seen = await other.query(
      "SELECT 1 FROM exchange.payment_intents WHERE payment_intent_id = $1", [pi.id]
    );
    assert.equal(seen.rows.length, 0, "an uncommitted payment intent was visible elsewhere");
  } finally {
    await client.query("ROLLBACK");
    other.release();
  }
});
