// The Stripe repo - payments.intents / attempts / settlements - against real
// Postgres.
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
import type { PoolClient } from "pg";
import { randomUUID } from "node:crypto";
import pool from "#db";
import * as repo from "#db/payments/repo.ts";

let client: PoolClient;

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

async function inRollback(fn: (c: PoolClient) => Promise<void>) {
  await client.query("BEGIN");
  try {
    await fn(client);
  } finally {
    await client.query("ROLLBACK");
  }
}

// Every fixture gets its own session id, so nothing another test file commits
// can be mistaken for one of these intents. payments.intents.session_id
// carries no foreign key - the session is better-auth's fact, not this
// schema's - so a fresh uuid is enough.
const aSession = async (_c: PoolClient, _userId: string) => randomUUID();

const aUser = async (c: PoolClient) =>
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
  await inRollback(async (c: PoolClient) => {
    const user = await aUser(c);
    const session = { session: { id: await aSession(c, user) }, user: { id: user } };
    const pi = intent();

    await repo.createPaymentIntent(pi, "checkout", null, session, c);

    const { rows } = await c.query(
      `SELECT i.user_id, i.type, i.status FROM payments.intents i
         JOIN payments.attempts a ON a.intent_id = i.id
        WHERE a.provider_ref = $1`,
      [pi.id]
    );
    assert.equal(rows.length, 1);
    assert.equal(rows[0].user_id, user);
    assert.equal(rows[0].type, "checkout");
    assert.equal(rows[0].status, pi.status);
  });
});

// An admin taking a payment on a customer's behalf: the intent belongs to the
// customer, not to the admin whose session it is. Getting this backwards would
// file the payment against the wrong person.
test("an admin intent is recorded against the customer, not the admin", async () => {
  await inRollback(async (c: PoolClient) => {
    const { rows: users } = await c.query("SELECT id FROM exchange.users ORDER BY id LIMIT 2");
    if (users.length < 2) return;
    const [admin, customer] = users.map((u) => u.id);
    const session = { session: { id: await aSession(c, admin) }, user: { id: admin } };
    const pi = intent();

    await repo.createPaymentIntent(pi, "admin", customer, session, c);

    const { rows } = await c.query(
      `SELECT i.user_id FROM payments.intents i
         JOIN payments.attempts a ON a.intent_id = i.id
        WHERE a.provider_ref = $1`, [pi.id]
    );
    assert.equal(rows[0].user_id, customer);
    assert.notEqual(rows[0].user_id, admin);
  });
});

test("an open intent is found again for the same session, user and type", async () => {
  await inRollback(async (c: PoolClient) => {
    const user = await aUser(c);
    const session = { session: { id: await aSession(c, user) }, user: { id: user } };
    const pi = intent();
    await repo.createPaymentIntent(pi, "checkout", null, session, c);

    // The provider's id for the intent is on the attempt rather than at the
    // top level, and since the conversion (2026-08-27) that is the wire shape
    // too.
    const found = await repo.retrievePaymentIntent("checkout", session, null, c);
    assert.equal(found?.attempt?.provider_ref, pi.id);
    assert.equal(found?.status, pi.status);
    assert.equal(
      (found as unknown as Record<string, unknown>)?.payment_intent_id,
      undefined,
      "the legacy names leaked into the repo"
    );
  });
});

// The filter that stops a customer being charged twice. An intent that has
// already succeeded, is processing, or was cancelled must never come back as
// reusable - the caller would hand it to Stripe again.
for (const status of ["succeeded", "processing", "canceled"]) {
  test(`an intent that is ${status} is not offered for reuse`, async () => {
    await inRollback(async (c: PoolClient) => {
      const user = await aUser(c);
      const session = { session: { id: await aSession(c, user) }, user: { id: user } };
      await repo.createPaymentIntent(intent({ status }), "checkout", null, session, c);

      const found = await repo.retrievePaymentIntent("checkout", session, null, c);
      assert.equal(found, undefined, `a ${status} intent was offered for reuse`);
    });
  });
}

test("an intent for a different type is not reused", async () => {
  await inRollback(async (c: PoolClient) => {
    const user = await aUser(c);
    const session = { session: { id: await aSession(c, user) }, user: { id: user } };
    await repo.createPaymentIntent(intent(), "checkout", null, session, c);

    assert.equal(await repo.retrievePaymentIntent("admin", session, user, c), undefined);
  });
});

test("an update lands on the named intent and no other", async () => {
  await inRollback(async (c: PoolClient) => {
    const user = await aUser(c);
    const session = { session: { id: await aSession(c, user) }, user: { id: user } };
    const mine = intent();
    const other = intent();
    await repo.createPaymentIntent(mine, "checkout", null, session, c);
    await repo.createPaymentIntent(other, "checkout", null, session, c);

    await repo.updatePaymentIntent(
      { ...mine, status: "succeeded", amount: 25000, amount_received: 25000 },
      c
    );

    // The new schema keeps money in DOLLARS (amount_expected) and what moved
    // as a settlement row; the Stripe payload arrives in cents.
    const { rows: [updated] } = await c.query(
      `SELECT i.status, i.amount_expected, st.settled_amount
         FROM payments.intents i
         JOIN payments.attempts a ON a.intent_id = i.id
         LEFT JOIN payments.settlements st ON st.attempt_id = a.id
        WHERE a.provider_ref = $1`,
      [mine.id]
    );
    const { rows: [untouched] } = await c.query(
      `SELECT i.status, i.amount_expected FROM payments.intents i
         JOIN payments.attempts a ON a.intent_id = i.id
        WHERE a.provider_ref = $1`,
      [other.id]
    );
    assert.equal(updated.status, "succeeded");
    assert.equal(Number(updated.amount_expected), 250);
    assert.equal(Number(updated.settled_amount), 250);
    assert.equal(untouched.status, "requires_payment_method");
    // The native create records amount_expected from the Stripe payload
    // (10000 cents -> $100), unlike exchange which had none until an update.
    assert.equal(Number(untouched.amount_expected), 100);
  });
});

test("attaching a Stripe customer sets it on that user alone", async () => {
  await inRollback(async (c: PoolClient) => {
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
      "SELECT 1 FROM payments.attempts WHERE provider_ref = $1", [pi.id]
    );
    assert.equal(inside.rows.length, 1, "the write did not happen at all");

    const seen = await other.query(
      "SELECT 1 FROM payments.attempts WHERE provider_ref = $1", [pi.id]
    );
    assert.equal(seen.rows.length, 0, "an uncommitted payment intent was visible elsewhere");
  } finally {
    await client.query("ROLLBACK");
    other.release();
  }
});
