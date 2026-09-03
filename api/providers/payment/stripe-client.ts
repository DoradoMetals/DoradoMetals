// The Stripe SDK client — a provider, not a feature (the same distinction providers/shipments makes); features/payments owns the domain, this owns the connection.
import "#env";
import { isTestRun } from "#shared/testing/is-test-run.ts";
import Stripe from "stripe";

// A test run may use a test key; it may NEVER use a live one — with a live key, a test reaching createIntent charges a real card, captureIntent takes real money. Stripe's key prefix (sk_test_ / sk_live_) makes this a stronger guard than FedEx's env-var-based one.
// No override, deliberately — a flag permitting a live key in a suite is a flag someone flips to make a red build green, and what it unblocks is charging customers.
// The key is read but never logged; only its prefix is ever mentioned.
const key = process.env.STRIPE_SECRET_KEY ?? "";

// Checked once at module evaluation (the client is constructed here) through the shared isTestRun(), so it can't drift from the other providers' checks.
if (isTestRun() && key.startsWith("sk_live")) {
  throw new Error(
    "refusing to build a Stripe client with a LIVE key during a test run.\n" +
      "A test reaching this would charge a real card. Use a test key " +
      "(sk_test_...) in the environment the suite runs in."
  );
}

// API version is pinned BY THE SDK, deliberately not overridden — since stripe-node 12, omitting apiVersion sends the version the SDK's types were generated against, so wire and types agree by construction and an upgrade moves both together. Overriding it is how they'd drift apart.
const stripeClient = new Stripe(key);

export default stripeClient;
