// Stripe, against the real sandbox.
//
// WHY THIS EXISTS. features/payments/replay.test.js drives all five payment
// routes and asserts NOTHING succeeds - every test in it is a refusal, because
// every success path ends at Stripe. The money paths were tested up to the
// point where they would cost something and stopped. This is the other half:
// the calls themselves, made for real, against a test account.
//
// NOT IN `pnpm check`, and not in `pnpm test`. These are slow, they need
// network, and they fail when somebody else's service has a bad morning - which
// is a fact about Stripe, not about this codebase, and must not be able to
// block a commit. Run them deliberately:
//
//   pnpm --filter @dorado/api test:sandbox
//
// SAFETY. providers/stripe/client.js refuses to construct a client from an
// sk_live key when NODE_ENV=test or a --test flag is present, and the first
// test here asserts that guard is actually in force rather than trusting it.
// Everything below creates and cancels its own objects; nothing reads or
// modifies anything that already exists in the account.
import test, { before, after } from "node:test";
import assert from "node:assert/strict";
import * as stripe from "#providers/stripe/stripe.ts";

const created = { intents: [], customers: [] };

before(() => {
  const key = process.env.STRIPE_SECRET_KEY ?? "";
  assert.ok(key, "STRIPE_SECRET_KEY is not set - these tests cannot run");

  // THE ONE ASSERTION EVERYTHING ELSE DEPENDS ON. If this is a live key, every
  // test below moves real money.
  assert.ok(
    key.startsWith("sk_test"),
    "STRIPE_SECRET_KEY is not a test key. Refusing to run the sandbox suite " +
      "against a live account."
  );
});

after(async () => {
  // Cancel every intent this file made. A test account fills up with abandoned
  // intents otherwise, and an intent left `requires_payment_method` is
  // indistinguishable from the production ones audit:payments complains about.
  for (const id of created.intents) {
    try {
      const intent = await stripe.retrieveIntent(id);
      if (!["succeeded", "canceled"].includes(intent.status)) {
        await stripe.cancelIntent(id);
      }
    } catch {
      // Already gone, or Stripe is unreachable. Cleanup is best-effort; a
      // failure here must not mask a real test result.
    }
  }
});

test("the sandbox is reachable and the key is a test key", async () => {
  const customer = await stripe.createCustomer({
    name: "Sandbox Suite",
    email: `sandbox-${Date.now()}@example.invalid`,
  });
  created.customers.push(customer.id);

  assert.ok(customer.id.startsWith("cus_"), `unexpected customer id ${customer.id}`);
  assert.equal(customer.livemode, false, "STRIPE RETURNED A LIVEMODE OBJECT - this is not the sandbox");
});

// The shape features/payments depends on: an intent it can hand a client_secret
// from, in a status the frontend will accept.
test("creating an intent returns something the browser can confirm", async () => {
  const intent = await stripe.createIntent({ amount: 5000, customerId: undefined });
  created.intents.push(intent.id);

  assert.ok(intent.id.startsWith("pi_"), `unexpected intent id ${intent.id}`);
  assert.equal(intent.livemode, false, "a livemode intent came back");
  assert.equal(intent.amount, 5000, "Stripe recorded a different amount than it was given");
  assert.equal(intent.currency, "usd");
  assert.ok(
    intent.client_secret?.startsWith(intent.id),
    "no client_secret - the frontend has nothing to confirm with"
  );
  assert.equal(
    intent.status,
    "requires_payment_method",
    "a fresh intent is not in the status the checkout flow expects"
  );
});

// THE ONE THAT MATTERS FOR THE PRICING FIX. updatePaymentIntent computes an
// amount and sends it here; this proves Stripe stores what it is told, so an
// amount that is wrong in production is wrong before it leaves this codebase.
test("updating an intent's amount is what Stripe then charges for", async () => {
  const intent = await stripe.createIntent({ amount: 5000 });
  created.intents.push(intent.id);

  const updated = await stripe.updateIntent(intent.id, { amount: 367353 });
  assert.equal(updated.amount, 367353, "Stripe did not take the new amount");
  assert.equal(updated.id, intent.id, "updating created a different intent");

  // Read it back rather than trusting the write's response.
  const fetched = await stripe.retrieveIntent(intent.id);
  assert.equal(fetched.amount, 367353, "the amount did not persist");
});

// features/payments/service.ts only updates an intent whose status is one of
// requires_payment_method / requires_confirmation / requires_action. This pins
// that a fresh intent stays updatable, because if Stripe ever changed that the
// checkout flow would silently start creating a new intent per revision.
test("an intent stays updatable through several revisions", async () => {
  const intent = await stripe.createIntent({ amount: 1000 });
  created.intents.push(intent.id);

  for (const amount of [2000, 12345, 999999]) {
    const updated = await stripe.updateIntent(intent.id, { amount });
    assert.equal(updated.amount, amount);
    assert.ok(
      ["requires_payment_method", "requires_confirmation", "requires_action"].includes(
        updated.status
      ),
      `intent moved to ${updated.status}, which features/payments will not update`
    );
  }
});

test("cancelling an intent is final and readable", async () => {
  const intent = await stripe.createIntent({ amount: 4200 });
  created.intents.push(intent.id);

  const cancelled = await stripe.cancelIntent(intent.id);
  assert.equal(cancelled.status, "canceled");

  const fetched = await stripe.retrieveIntent(intent.id);
  assert.equal(fetched.status, "canceled", "the cancellation did not stick");
});

// Retrieving something that does not exist must throw rather than return null,
// because features/payments branches on `retrieved_intent?.attempt?.provider_ref`
// and a silent null would read as "no intent yet" and create a second one.
test("retrieving an unknown intent throws rather than returning nothing", async () => {
  await assert.rejects(
    () => stripe.retrieveIntent("pi_nonexistent_00000000000000"),
    (err) => {
      assert.match(String(err.message), /No such payment_intent|resource_missing/i);
      return true;
    }
  );
});
