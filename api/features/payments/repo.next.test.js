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
import * as next from "#features/payments/repo.next.ts";
import * as exchange from "#features/payments/repo.exchange.js";
import { toLegacy, fromLegacy } from "#features/payments/wire.ts";

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

    // The read now returns the new schema's unit, because the internal shape is
    // the new schema's - the cents the frontend expects are put back by the
    // adapter at the edge, and that half is asserted in "the adapter converts
    // dollars back to cents and back again".
    const read = await next.retrievePaymentIntent(
      "sales_order_checkout", aSession(user.id), user.id, c
    );
    assert.equal(Number(read.amount_expected), 434, "the read did not stay in dollars");
    assert.equal(
      Number(toLegacy(read).amount),
      43400,
      "the adapter did not put the cents back for the legacy wire"
    );
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

// ------------------------------------------------------------------ the wire
//
// The repos return the new shape on both sides. These are about the shim that
// converts it back, and about the two ways it could be catastrophic rather than
// merely wrong: money by a factor of a hundred, and an object that is not ours
// being rewritten on its way out.

test("the adapter converts the new shape back to the names the frontend reads", async () => {
  await inRollback(async (c) => {
    const rows = await c.query(
      `SELECT id FROM exchange.payment_intents WHERE method_id IS NOT NULL LIMIT 1`
    );
    assert.ok(rows.rows.length, "dev has no intent with an instrument recorded");

    const internal = await exchange.getPaymentIntentFromSalesOrderId(
      (
        await c.query(
          `SELECT sales_order_id FROM exchange.payment_intents
            WHERE sales_order_id IS NOT NULL LIMIT 1`
        )
      ).rows[0].sales_order_id,
      c
    );
    assert.ok(internal, "dev has no intent against a sales order");

    const legacy = toLegacy(internal);
    // Exactly the names AdminPending.tsx destructures.
    assert.equal(legacy.payment_status, internal.status);
    assert.equal(legacy.payment_intent_id, internal.attempt.provider_ref);
    assert.equal(legacy.sales_order_id, internal.order_id);
    assert.equal(legacy.purchase_order_id, null);
    assert.ok(!("attempt" in legacy), "the nested shape leaked to the legacy wire");
    assert.ok(!("status" in legacy), "the nested shape leaked to the legacy wire");
  });
});

// A hundredfold error, in both directions. exchange stores cents; the internal
// shape is dollars.
test("the adapter converts dollars back to cents and back again", () => {
  const internal = {
    id: "x",
    status: "succeeded",
    order_id: "o",
    direction: "sale",
    amount_expected: 434,
    amount_received: 434,
    amount_capturable: null,
    attempt: { provider: "stripe", provider_ref: "pi_x", status: "succeeded" },
    details: null,
  };

  const legacy = toLegacy(internal);
  assert.equal(legacy.amount, 43400, "dollars must become cents on the legacy wire");
  assert.equal(legacy.amount_received, 43400);
  assert.equal(legacy.amount_capturable, null);

  const back = fromLegacy(legacy);
  assert.equal(back.amount_expected, 434, "cents must become dollars coming back");
  assert.equal(back.amount_received, 434);
  assert.equal(back.attempt.provider_ref, "pi_x");
  assert.equal(back.order_id, "o");
  assert.equal(back.direction, "sale");
});

// exchange has two order columns and the new schema has one. Which one it came
// out of has to survive the round trip or the adapter files a sale under
// purchases.
test("the order id goes back into the column it came from", () => {
  const sale = toLegacy({ order_id: "o", direction: "sale", attempt: {} });
  assert.equal(sale.sales_order_id, "o");
  assert.equal(sale.purchase_order_id, null);

  const purchase = toLegacy({ order_id: "o", direction: "purchase", attempt: {} });
  assert.equal(purchase.purchase_order_id, "o");
  assert.equal(purchase.sales_order_id, null);

  const none = toLegacy({ order_id: null, direction: null, attempt: {} });
  assert.equal(none.sales_order_id, null);
  assert.equal(none.purchase_order_id, null);
});

// The reason isOurs exists. cancel_payment_intent answers with Stripe's own
// object through the same res.json the middleware wraps.
test("a Stripe object passes through the adapter untouched", () => {
  const stripeIntent = {
    id: "pi_3RcYBRCuc07t1nZa1YgtxcS5",
    object: "payment_intent",
    status: "canceled",
    amount: 43400,
    client_secret: "pi_3RcYBR_secret_xyz",
    payment_method: "pm_1abc",
  };
  assert.deepEqual(
    toLegacy(stripeIntent),
    stripeIntent,
    "the adapter rewrote a Stripe response into a half-null version of itself"
  );

  // And the strings the other two routes answer with.
  assert.equal(toLegacy("pi_3RcYBR_secret_xyz"), "pi_3RcYBR_secret_xyz");
  assert.equal(toLegacy(null), null);
});

// A bank routing number must not be on the wire, whichever shape it is in.
test("no payments response carries a routing number", async () => {
  await inRollback(async (c) => {
    const { rows } = await c.query(
      `SELECT sales_order_id FROM exchange.payment_intents
        WHERE sales_order_id IS NOT NULL LIMIT 1`
    );
    const internal = await exchange.getPaymentIntentFromSalesOrderId(
      rows[0].sales_order_id,
      c
    );
    for (const shape of [internal, toLegacy(internal)]) {
      const flat = JSON.stringify(shape);
      assert.ok(!/"routing"/.test(flat), `a routing key reached the wire: ${flat}`);
    }
  });
});

test("both implementations return the same keys", async () => {
  await inRollback(async (c) => {
    const { rows } = await c.query(
      `SELECT e.sales_order_id
         FROM exchange.payment_intents e
         JOIN payments.attempts a ON a.provider_ref = e.payment_intent_id
        WHERE e.sales_order_id IS NOT NULL LIMIT 1`
    );
    if (!rows.length) return; // nothing the two schemas both hold

    const a = await exchange.getPaymentIntentFromSalesOrderId(rows[0].sales_order_id, c);
    const b = await next.getPaymentIntentFromSalesOrderId(rows[0].sales_order_id, c);
    if (!a || !b) return;

    assert.deepEqual(
      Object.keys(a).sort(),
      Object.keys(b).sort(),
      "the two implementations no longer return the same shape"
    );
    assert.deepEqual(Object.keys(a.attempt).sort(), Object.keys(b.attempt).sort());
  });
});

// The sharper half of the same finding as "a paid intent is never offered for
// reuse". exchange's amount_received is written by the webhook, and for three
// production intents the webhook never landed: Stripe captured $51.78, $64.70
// and $10.00 and exchange records amount_received as null or 0 while still
// saying requires_payment_method.
//
// The new schema has a settlement for each, because 074 derives them from the
// Stripe export rather than from whatever the webhook last managed to write.
// Asserted here rather than ignored in the diff, because it is the migration
// being more correct and not the two implementations disagreeing by accident.
test("the new schema knows about money exchange has no record of", async () => {
  await inRollback(async (c) => {
    const { rows } = await c.query(
      `SELECT e.sales_order_id, e.payment_intent_id, e.amount_received
         FROM exchange.payment_intents e
         JOIN payments.attempts a  ON a.provider_ref = e.payment_intent_id
         JOIN payments.settlements s ON s.attempt_id = a.id
        WHERE e.sales_order_id IS NOT NULL
          AND coalesce(e.amount_received, 0) = 0
          AND s.settled_amount > 0
        LIMIT 1`
    );
    if (!rows.length) return; // dev does not hold one of the three

    const legacy = await exchange.getPaymentIntentFromSalesOrderId(rows[0].sales_order_id, c);
    const migrated = await next.getPaymentIntentFromSalesOrderId(rows[0].sales_order_id, c);

    assert.ok(
      legacy.amount_received == null || Number(legacy.amount_received) === 0,
      "exchange was expected to have no record of this payment"
    );
    assert.ok(
      Number(migrated.amount_received) > 0,
      "the new schema lost the settlement this test exists to prove it keeps"
    );
  });
});

// WHICH INTENT A SALES ORDER RESOLVES TO, WHEN IT HAS MORE THAN ONE.
//
// exchange's lookup was `rows[0]` off a SELECT with no ORDER BY and no LIMIT,
// so the row it returned was whatever the plan happened to yield first. The new
// implementation has always ordered newest-first and taken one. repo.dual
// switches between them, which means the admin screen could name one intent
// today and another after a VACUUM, entirely legally.
//
// Nothing shows it right now: no sales order in dev OR production has a second
// intent. That changes the first time a checkout fails and the customer tries
// again, which is precisely the situation the admin screen is opened for.
//
// This test creates the second intent, so it does not depend on dev holding one.
test("a sales order with two intents resolves to the newer one, both ways", async () => {
  await inRollback(async (c) => {
    const { rows: [order] } = await c.query(
      `SELECT so.id FROM exchange.sales_orders so
        WHERE EXISTS (SELECT 1 FROM orders.orders o WHERE o.id = so.id)
        ORDER BY so.id LIMIT 1`
    );
    assert.ok(order, "dev needs a sales order present in both schemas");

    // A real session row: exchange.payment_intents.session_id is a foreign key
    // into exchange.session, and the new schema keys on it too.
    const { rows: [sess] } = await c.query(
      `SELECT s.id, s."userId" AS user_id FROM exchange.session s
        WHERE EXISTS (SELECT 1 FROM auth.users a WHERE a.id = s."userId")
        ORDER BY s.id LIMIT 1`
    );
    assert.ok(sess, "dev needs a session belonging to a user present in both schemas");
    const user = { id: sess.user_id };
    const older = stripeIntent({ id: `pi_old_${randomUUID().slice(0, 8)}` });
    const newer = stripeIntent({ id: `pi_new_${randomUUID().slice(0, 8)}` });

    // exchange: two rows against the same sales order, an hour apart.
    for (const [pi, ago] of [[older, "2 hours"], [newer, "1 hour"]]) {
      await c.query(
        `INSERT INTO exchange.payment_intents
           (session_id, user_id, type, payment_status, payment_intent_id,
            sales_order_id, created_at)
         VALUES ($1, $2, 'checkout', $3, $4, $5, now() - $6::interval)`,
        [sess.id, user.id, pi.status, pi.id, order.id, ago]
      );
    }

    // next: the same two, through the repo, then pointed at the order.
    for (const [pi, ago] of [[older, "2 hours"], [newer, "1 hour"]]) {
      await next.createPaymentIntent(pi, "checkout", user.id, { session: { id: sess.id }, user: { id: user.id } }, c);
      await c.query(
        `UPDATE payments.intents i SET order_id = $1, created_at = now() - $2::interval
           FROM payments.attempts a
          WHERE a.intent_id = i.id AND a.provider_ref = $3`,
        [order.id, ago, pi.id]
      );
    }

    const fromExchange = await exchange.getPaymentIntentFromSalesOrderId(order.id, c);
    const fromNext = await next.getPaymentIntentFromSalesOrderId(order.id, c);

    assert.equal(
      fromExchange?.attempt?.provider_ref, newer.id,
      "exchange returned an intent that is not the newest - the lookup is unordered"
    );
    assert.equal(
      fromNext?.attempt?.provider_ref, newer.id,
      "the new schema returned an intent that is not the newest"
    );
    assert.equal(
      fromExchange?.attempt?.provider_ref, fromNext?.attempt?.provider_ref,
      "the two implementations resolved the same sales order to different intents"
    );
  });
});
