import test, { before, after } from "node:test";
import assert from "node:assert/strict";
import "#env";
import * as stripe from "#providers/payment/stripe.ts";
import stripeClient from "#providers/payment/stripe-client.ts";

const created: string[] = [];

before(() => {
  const key = process.env.STRIPE_SECRET_KEY ?? "";
  assert.ok(key, "STRIPE_SECRET_KEY is not set - this lane cannot run");

  assert.ok(
    key.startsWith("sk_test"),
    "STRIPE_SECRET_KEY is not a test key. Refusing to run test:external " +
      "against a live account - every scenario below would move real money."
  );
});

after(async () => {
  for (const id of created) {
    try {
      const intent = await stripe.retrieveIntent(id);
      if (!["succeeded", "canceled"].includes(String(intent.status))) {
        await stripe.cancelIntent(id);
      }
    } catch {
    }
  }
});

test("creating an intent twice with the same idempotency key returns the same intent", async () => {
  const key = `external:create:${Date.now()}:${Math.random().toString(36).slice(2)}`;
  const first = await stripe.createIntent({
    amount: 5000,
    metadata: { type: "external-suite", user_id: "external", session_id: "external" },
    idempotencyKey: key,
  });
  created.push(first.id);

  const second = await stripe.createIntent({
    amount: 5000,
    metadata: { type: "external-suite", user_id: "external", session_id: "external" },
    idempotencyKey: key,
  });

  assert.ok(first.id.startsWith("pi_"), `unexpected intent id ${first.id}`);
  assert.equal(first.livemode, false, "a livemode intent came back - this is not test mode");
  assert.equal(first.amount, 5000, "Stripe recorded a different amount than it was given");
  assert.equal(first.status, "requires_payment_method");
  assert.equal(
    second.id, first.id,
    "the idempotency key did not hold - a network retry would mint an orphan intent"
  );
});

test("updating an intent's amount is what Stripe then holds, and it stays updatable", async () => {
  const intent = await stripe.createIntent({ amount: 1000 });
  created.push(intent.id);

  for (const amount of [2000, 367353]) {
    const updated = await stripe.updateIntent(intent.id, { amount });
    assert.equal(updated.amount, amount, "Stripe did not take the new amount");
    assert.equal(updated.id, intent.id, "updating created a different intent");
    assert.ok(
      ["requires_payment_method", "requires_confirmation", "requires_action"].includes(
        String(updated.status)
      ),
      `intent moved to ${updated.status}, which payments will not update`
    );
  }

  const fetched = await stripe.retrieveIntent(intent.id);
  assert.equal(fetched.amount, 367353, "the amount did not persist");
});

test("cancelling an intent is final and readable", async () => {
  const intent = await stripe.createIntent({ amount: 4200 });
  created.push(intent.id);

  const cancelled = await stripe.cancelIntent(intent.id);
  assert.equal(cancelled.status, "canceled");

  const fetched = await stripe.retrieveIntent(intent.id);
  assert.equal(fetched.status, "canceled", "the cancellation did not stick");
});

// cancelIntent SWALLOWS resource_missing on purpose (2026-09-03, 4cd75534):
// "no such intent" and "already canceled" are the same STATE to every caller -
// the sweeps and cancelIntentByRef need cancelling to be idempotent. retrieve
// has no such reading and still throws. This lane asserted the pre-4cd75534
// rejecting shape until the Stripe 22 pass ran it; the drift is the provider's,
// not the SDK's, and `test:external` is not in `pnpm check` to have caught it.
test("an id Stripe never issued cancels as already-canceled and refuses to be retrieved", async () => {
  const bogus = `pi_external_no_such_${Date.now()}`;

  const cancelled = await stripe.cancelIntent(bogus);
  assert.equal(cancelled.id, bogus);
  assert.equal(cancelled.status, "canceled");

  await assert.rejects(
    () => stripe.retrieveIntent(bogus),
    /No such payment_intent|resource_missing/i
  );
});

test("webhook signature verification against the configured secret", async () => {
  const payload = JSON.stringify({
    id: "evt_external_suite",
    object: "event",
    type: "payment_intent.succeeded",
    data: { object: { id: "pi_external_suite", object: "payment_intent", status: "succeeded" } },
  });

  const configured = process.env.STRIPE_WEBHOOK_SECRET;
  const secret = configured || "whsec_external_fallback_0000000000000000000000";
  const header = stripeClient.webhooks.generateTestHeaderString({ payload, secret });

  const previous = process.env.STRIPE_WEBHOOK_SECRET;
  process.env.STRIPE_WEBHOOK_SECRET = secret;
  try {
    const event = stripe.verifyWebhook(payload, header);
    assert.equal(event.type, "payment_intent.succeeded");
    assert.equal((event.data.object as { id: string }).id, "pi_external_suite");

    assert.throws(
      () => stripe.verifyWebhook(payload.replace("succeeded", "canceled"), header),
      /signature/i,
      "a tampered payload verified - the webhook door is open"
    );
    assert.throws(
      () =>
        stripe.verifyWebhook(
          payload,
          stripeClient.webhooks.generateTestHeaderString({
            payload, secret: "whsec_someone_elses_secret",
          })
        ),
      /signature/i,
      "a payload signed with the wrong secret verified"
    );
  } finally {
    if (previous === undefined) delete process.env.STRIPE_WEBHOOK_SECRET;
    else process.env.STRIPE_WEBHOOK_SECRET = previous;
  }

  if (!configured) {
    console.warn(
      "STRIPE_WEBHOOK_SECRET is not set - verified against a synthetic secret only, " +
        "which proves the SDK's sign/verify pair works but not that the deployed " +
        "secret does."
    );
  }
});
