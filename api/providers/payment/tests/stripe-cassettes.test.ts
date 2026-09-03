// THE STRIPE CALLS, AGAINST RECORDED TEST-MODE RESPONSES.
//
// *** EVERY ONE OF THESE WAS UNTESTED. *** docs/waves/test-suite-redesign.md
// 1.3: "every Stripe success path is untested - three of the five payments
// routes end at Stripe, and payments/replay.test.ts says in its header that it
// asserts refusals only". There was no seam and no mock library, so the only
// two possibilities were "call Stripe for real from the suite" and "assert
// nothing". Lane 4 closed the first one; this file is the third possibility.
//
// WHAT IS PINNED HERE AND WHY IT MATTERS ELSEWHERE. These are the requests
// `domain/payments/service.ts` makes. Two service tests replay the same
// cassettes (`create-intent-cassette.test.ts` and the un-skipped tail of
// `update-intent.test.ts`), so recording them here keeps the recording pass
// off the database entirely - `pnpm test:record` re-records every cassette
// from ONE file per provider.
//
// *** IDEMPOTENCY KEYS ARE FIXED PER SCENARIO, NOT PER RUN. *** A key built
// from Date.now() would make every recording a different request and every
// replay a mismatch. Stripe sends the key as a HEADER, and nock records no
// request headers (see shared/testing/cassettes.ts), so the key is not what a
// cassette matches on - what it pins is that two calls with the SAME key
// return the SAME intent, which is recorded as two responses and asserted
// below. Test CLOCKS are deliberately absent: a clock is a server-side object
// and has no meaning in a replayed response, so it belongs to `test:external`.
import { test } from "vitest";
import assert from "node:assert/strict";
import { withCassette } from "#shared/testing/cassettes.ts";
import * as stripe from "#providers/payment/stripe.ts";
import stripeClient from "#providers/payment/stripe-client.ts";

// The metadata `createPaymentIntent` attaches (D25 - a webhook payload carries
// no session, user or type, so they ride on the intent). Fixed strings here;
// the harness normalises user_id and session_id on both sides, so a service
// test replaying this cassette matches with its own fixture row's ids.
const METADATA = {
  type: "customer",
  user_id: "cassette-user",
  session_id: "cassette-session",
};

// An id Stripe has never issued. Shared with `domain/payments/tests/
// sweeps.test.ts`, which seeds it as a provider_ref so the abandonment sweep
// walks its "no such payment_intent" branch.
export const NO_SUCH_INTENT = "pi_cassette_no_such_intent";

test("the same idempotency key returns the same intent, not a second one", async () => {
  const [first, second] = await withCassette("stripe/create-intent-idempotent.json", async () => {
    const args = {
      amount: 5000,
      metadata: METADATA,
      idempotencyKey: "cassette:create-intent:v1",
    };
    return [await stripe.createIntent(args), await stripe.createIntent(args)];
  });

  assert.ok(first!.id.startsWith("pi_"), `unexpected intent id ${first!.id}`);
  assert.equal(first!.livemode, false, "a livemode intent was recorded");
  assert.equal(first!.amount, 5000, "Stripe recorded a different amount than it was given");
  assert.equal(first!.currency, "usd");
  assert.equal(first!.status, "requires_payment_method");
  assert.equal(
    second!.id, first!.id,
    "the idempotency key did not hold - a network retry would mint an orphan intent"
  );
});

test("an intent opened for a customer carries the reconciliation metadata", async () => {
  const intent = await withCassette("stripe/create-payment-intent.json", async () => {
    const customer = await stripe.createCustomer({
      name: "Cassette Suite", email: "cassette@example.invalid",
    });
    return await stripe.createIntent({
      amount: 1000,
      customerId: customer.id,
      metadata: METADATA,
      idempotencyKey: "cassette:create-payment-intent:v1",
    });
  });

  // The placeholder amount createPaymentIntent opens with, before the cart is
  // priced (D199 - there is no $10 FLOOR any more, but there is still a $10
  // start).
  assert.equal(intent.amount, 1000, "the opening amount is not what the service sends");
  assert.equal(intent.metadata?.type, METADATA.type, "the intent carries no type");
  assert.ok(intent.metadata?.user_id, "the intent carries no user_id - D25's lifeline is cut");
  assert.ok(intent.metadata?.session_id, "the intent carries no session_id");
  assert.ok(
    intent.client_secret?.startsWith(intent.id),
    "no client_secret - the frontend has nothing to confirm with"
  );
});

test("updating an amount is what Stripe then holds, and the intent stays updatable", async () => {
  const { updated, fetched } = await withCassette("stripe/update-intent-amount.json", async () => {
    const intent = await stripe.createIntent({
      amount: 5000, metadata: METADATA, idempotencyKey: "cassette:update-intent:v1",
    });
    const changed = await stripe.updateIntent(intent.id, { amount: 367353 });
    return { updated: changed, fetched: await stripe.retrieveIntent(intent.id) };
  });

  assert.equal(updated.amount, 367353, "Stripe did not take the new amount");
  assert.equal(fetched.amount, 367353, "the amount did not persist");
  assert.equal(fetched.id, updated.id, "updating created a different intent");
  // `domain/payments/service.ts` only updates an intent in one of these three,
  // so a status change here would silently start minting an intent per revision.
  assert.ok(
    ["requires_payment_method", "requires_confirmation", "requires_action"].includes(
      String(updated.status)
    ),
    `intent moved to ${updated.status}, which domain/payments will not update`
  );
});

test("cancelling an intent is final and readable", async () => {
  const { cancelled, fetched } = await withCassette("stripe/cancel-intent.json", async () => {
    const intent = await stripe.createIntent({
      amount: 4200, metadata: METADATA, idempotencyKey: "cassette:cancel-intent:v1",
    });
    const done = await stripe.cancelIntent(intent.id);
    return { cancelled: done, fetched: await stripe.retrieveIntent(intent.id) };
  });

  assert.equal(cancelled.status, "canceled");
  assert.equal(fetched.status, "canceled", "the cancellation did not stick");
});

// THE BRANCH THE ABANDONMENT SWEEP RUNS ON. cancelIntentByRef treats "no such
// payment_intent" as already-abandoned and persists the fact; anything else
// propagates. Nothing had ever exercised the message it matches on.
test("cancelling an intent Stripe never issued raises the message the sweep matches", async () => {
  await withCassette("stripe/cancel-unknown-intent.json", async () => {
    await assert.rejects(
      () => stripe.cancelIntent(NO_SUCH_INTENT),
      (err: Error) => {
        assert.match(
          String(err.message),
          /No such payment_intent|resource_missing/i,
          "the message domain/payments/service.ts regex-matches on has changed"
        );
        return true;
      }
    );
  });
});

// Retrieving something that does not exist must THROW rather than resolve to
// nothing: the service branches on `retrieved_intent?.attempt?.provider_ref`,
// and a silent null would read as "no intent yet" and open a second one.
test("retrieving an unknown intent throws rather than returning nothing", async () => {
  await withCassette("stripe/retrieve-unknown-intent.json", async () => {
    await assert.rejects(
      () => stripe.retrieveIntent(NO_SUCH_INTENT),
      /No such payment_intent|resource_missing/i
    );
  });
});

// ---------------------------------------------------------------------------
// THE WEBHOOK DOOR. No cassette and no network: `constructEvent` is signature
// arithmetic over a payload and a secret, and Stripe's own
// `generateTestHeaderString` is the tool for signing one. It was untested in
// EVERY lane (design doc 1.4: "webhook signature verification - no, no").
//
// The secret is a fixed literal set for the duration, not the one in
// `api/.env`: a default-lane test must not depend on a real credential being
// present, and `verifyWebhook` reads STRIPE_WEBHOOK_SECRET at CALL time
// (requiredEnv), so setting it here is enough. `tests-external/stripe.test.ts`
// runs the same assertion against the real secret.
// ---------------------------------------------------------------------------
const FIXED_WEBHOOK_SECRET = "whsec_cassette_0000000000000000000000000000000000";

function signed(payload: string, secret = FIXED_WEBHOOK_SECRET) {
  return stripeClient.webhooks.generateTestHeaderString({ payload, secret });
}

const EVENT = JSON.stringify({
  id: "evt_cassette_suite",
  object: "event",
  type: "payment_intent.succeeded",
  data: { object: { id: "pi_cassette_suite", object: "payment_intent", status: "succeeded" } },
});

test("a webhook signed with the configured secret verifies", async () => {
  const previous = process.env.STRIPE_WEBHOOK_SECRET;
  process.env.STRIPE_WEBHOOK_SECRET = FIXED_WEBHOOK_SECRET;
  try {
    const event = stripe.verifyWebhook(EVENT, signed(EVENT));
    assert.equal(event.type, "payment_intent.succeeded");
    assert.equal((event.data.object as { id: string }).id, "pi_cassette_suite");
  } finally {
    if (previous === undefined) delete process.env.STRIPE_WEBHOOK_SECRET;
    else process.env.STRIPE_WEBHOOK_SECRET = previous;
  }
});

test("a tampered payload, and a payload signed with another secret, are both refused", async () => {
  const previous = process.env.STRIPE_WEBHOOK_SECRET;
  process.env.STRIPE_WEBHOOK_SECRET = FIXED_WEBHOOK_SECRET;
  try {
    const header = signed(EVENT);
    assert.throws(
      () => stripe.verifyWebhook(EVENT.replace("succeeded", "canceled"), header),
      /signature/i,
      "a tampered payload verified - the webhook door is open"
    );
    assert.throws(
      () => stripe.verifyWebhook(EVENT, signed(EVENT, "whsec_someone_elses_secret")),
      /signature/i,
      "a payload signed with the wrong secret verified"
    );
  } finally {
    if (previous === undefined) delete process.env.STRIPE_WEBHOOK_SECRET;
    else process.env.STRIPE_WEBHOOK_SECRET = previous;
  }
});
