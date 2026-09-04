import { test } from "vitest";
import assert from "node:assert/strict";
import { withCassette } from "#shared/testing/cassettes.ts";
import * as stripe from "#providers/payment/stripe.ts";
import stripeClient from "#providers/payment/stripe-client.ts";

const METADATA = {
  type: "customer",
  user_id: "cassette-user",
  session_id: "cassette-session",
};

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

test("cancelling an intent Stripe never issued resolves as already canceled", async () => {
  await withCassette("stripe/cancel-unknown-intent.json", async () => {
    const result = await stripe.cancelIntent(NO_SUCH_INTENT);
    assert.equal(result.id, NO_SUCH_INTENT);
    assert.equal(result.status, "canceled");
  });
});

test("a Stripe error that is not 'unknown' or 'already canceled' propagates", async () => {
  await withCassette("stripe/cancel-intent-transient-error.json", async () => {
    await assert.rejects(
      () => stripe.cancelIntent("pi_cassette_transient_error"),
      /status of processing/i
    );
  });
});

test("retrieving an unknown intent throws rather than returning nothing", async () => {
  await withCassette("stripe/retrieve-unknown-intent.json", async () => {
    await assert.rejects(
      () => stripe.retrieveIntent(NO_SUCH_INTENT),
      /No such payment_intent|resource_missing/i
    );
  });
});

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
