// Payments against the new schema.
//
// exchange keeps one row per Stripe intent with everything inline. The new
// schema separates what was asked for (payments.intents) from what was tried
// (payments.attempts, carrying the provider's reference) and what moved
// (payments.settlements).
//
// Each test runs inside a transaction that is rolled back, so no intent, attempt
// or settlement survives.
import test, { after, before } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import pool from "#db";
import * as next from "#features/payments/repo.next.js";
import * as exchange from "#features/payments/repo.exchange.js";

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

const aUser = async (c) =>
  (await c.query(
    `SELECT u.id FROM exchange.users u
      WHERE EXISTS (SELECT 1 FROM auth.users a WHERE a.id = u.id) ORDER BY u.id LIMIT 1`
  )).rows[0];

const aSession = (userId) => ({
  session: { id: "00000000-0000-4000-8000-0000000000ff" },
  user: { id: userId },
});

const stripeIntent = (over = {}) => ({
  id: `pi_test_${randomUUID().slice(0, 12)}`,
  status: "requires_payment_method",
  amount: 43400,
  amount_received: 0,
  amount_capturable: 0,
  payment_method: null,
  ...over,
});

// The unit conversion is the thing most likely to be silently wrong, and being
// wrong by 100x on money is not a rounding error.
test("amounts round trip through cents and dollars", async () => {
  await inRollback(async (c) => {
    const user = await aUser(c);
    const intent = stripeIntent({ amount: 43400 });

    await next.createPaymentIntent(intent, "sales_order_checkout", user.id, aSession(user.id), c);

    const { rows: [stored] } = await c.query(
      `SELECT i.amount_expected FROM payments.intents i
       JOIN payments.attempts a ON a.intent_id = i.id WHERE a.provider_ref = $1`,
      [intent.id]
    );
    assert.equal(Number(stored.amount_expected), 434, "dollars are not cents/100");

    const read = await next.retrievePaymentIntent(
      "sales_order_checkout", aSession(user.id), user.id, c
    );
    assert.equal(Number(read.amount), 43400, "the read did not convert back to cents");
  });
});

test("an intent and its attempt are created together", async () => {
  await inRollback(async (c) => {
    const user = await aUser(c);
    const intent = stripeIntent();

    await next.createPaymentIntent(intent, "sales_order_checkout", user.id, aSession(user.id), c);

    const { rows } = await c.query(
      `SELECT a.provider, a.provider_ref, a.status FROM payments.attempts a
       WHERE a.provider_ref = $1`,
      [intent.id]
    );
    assert.equal(rows.length, 1, "no attempt was created for the intent");
    assert.equal(rows[0].provider, "stripe");
  });
});

// A settlement exists only once money has moved. exchange keeps amount_received
// on the intent whether it is zero or not.
test("a settlement appears only when money has moved", async () => {
  await inRollback(async (c) => {
    const user = await aUser(c);
    const intent = stripeIntent();
    await next.createPaymentIntent(intent, "sales_order_checkout", user.id, aSession(user.id), c);

    await next.updatePaymentIntent({ ...intent, amount_received: 0 }, c);
    let { rows } = await c.query(
      `SELECT 1 FROM payments.settlements s
       JOIN payments.attempts a ON a.id = s.attempt_id WHERE a.provider_ref = $1`, [intent.id]);
    assert.equal(rows.length, 0, "a settlement was recorded for a payment that did not happen");

    await next.updatePaymentIntent(
      { ...intent, status: "succeeded", amount_received: 43400 }, c);
    ({ rows } = await c.query(
      `SELECT s.settled_amount FROM payments.settlements s
       JOIN payments.attempts a ON a.id = s.attempt_id WHERE a.provider_ref = $1`, [intent.id]));
    assert.equal(rows.length, 1, "money moved and nothing recorded it");
    assert.equal(Number(rows[0].settled_amount), 434, "settled amount is not in dollars");
  });
});

// The bug this split found, asserted as a property rather than left in a comment.
//
// retrievePaymentIntent hands back an unresolved intent for reuse. exchange
// decides "unresolved" from its own payment_status, which is only as fresh as
// the last webhook it processed - and in production three intents say
// requires_payment_method while Stripe says the charge was Paid. Reusing one of
// those gets the customer a rejected confirmation and a broken checkout.
//
// The new schema derives status from Stripe (074), so it excludes them. This
// asserts that difference in the direction that matters: whatever else the two
// disagree about, next must never offer an intent that has already been paid.
test("a paid intent is never offered for reuse", async () => {
  await inRollback(async (c) => {
    const user = await aUser(c);
    const intent = stripeIntent();
    await next.createPaymentIntent(intent, "sales_order_checkout", user.id, aSession(user.id), c);

    const before = await next.retrievePaymentIntent(
      "sales_order_checkout", aSession(user.id), user.id, c);
    assert.ok(before, "an unresolved intent should be reusable");

    // Stripe says it succeeded.
    await c.query(
      `UPDATE payments.intents SET status = 'succeeded'
        WHERE id = (SELECT intent_id FROM payments.attempts WHERE provider_ref = $1)`,
      [intent.id]
    );

    const after = await next.retrievePaymentIntent(
      "sales_order_checkout", aSession(user.id), user.id, c);
    assert.equal(after, undefined, "an intent that already took money was offered for reuse");
  });
});

// Both implementations must agree about WHICH intent, even where they disagree
// about its status - the id is what the checkout is resumed with.
test("both implementations find the same Stripe intent", async () => {
  await inRollback(async (c) => {
    const { rows: [seed] } = await c.query(
      `SELECT session_id, user_id, type FROM exchange.payment_intents
        WHERE session_id IS NOT NULL AND payment_intent_id IS NOT NULL LIMIT 1`
    );
    if (!seed) return; // dev has none with a session; nothing to compare

    const session = { session: { id: seed.session_id }, user: { id: seed.user_id } };
    const [a, b] = [
      await exchange.retrievePaymentIntent(seed.type, session, seed.user_id, c),
      await next.retrievePaymentIntent(seed.type, session, seed.user_id, c),
    ];
    if (!a || !b) return;
    assert.equal(b.payment_intent_id, a.payment_intent_id, "they resumed different intents");
    assert.equal(Number(b.amount), Number(a.amount), "they disagree about the amount");
  });
});
