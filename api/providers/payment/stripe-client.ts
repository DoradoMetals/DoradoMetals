// The Stripe SDK client.
//
// Moved here from features/stripe because Stripe is a provider, not a feature -
// the same distinction providers/shipments already made. A feature is something the
// business does; a provider is a third party it does it through. What was
// features/stripe was both at once: the payments domain AND the SDK it happens
// to use.
//
// features/payments owns the domain. This owns the connection.
import "#env";
import { isTestRun } from "#shared/testing/is-test-run.ts";
import Stripe from "stripe";

// A TEST RUN MAY USE A TEST KEY. IT MAY NEVER USE A LIVE ONE.
//
// The same rule as providers/shipments: the hazard is the live account, not the
// provider. With a live key, a test that reaches createIntent charges a real
// card and a test that reaches captureIntent takes real money.
//
// Stripe makes this easy to check because it says so in the key itself -
// sk_test_ against sk_live_ - so this is a stronger guard than the FedEx one,
// which has to trust an environment variable to describe the endpoint.
//
// There is deliberately no override. A flag permitting a live key in a suite is
// a flag someone sets to make a red build go green, and the thing it unblocks
// is charging customers.
//
// The key is read but never logged. Only its prefix is ever mentioned.
const key = process.env.STRIPE_SECRET_KEY ?? "";

// Asked at call time rather than captured at module scope; see
// shared/testing/is-test-run.ts. This one is still evaluated during module
// evaluation because the client is constructed there - but through the shared
// function, so it cannot drift from the other two.
if (isTestRun() && key.startsWith("sk_live")) {
  throw new Error(
    "refusing to build a Stripe client with a LIVE key during a test run.\n" +
      "A test reaching this would charge a real card. Use a test key " +
      "(sk_test_...) in the environment the suite runs in."
  );
}

// API VERSION: pinned BY THE SDK, deliberately not overridden here. Since
// stripe-node 12, an omitted apiVersion sends the version the SDK's types were
// generated against - wire and types agree by construction, and an SDK upgrade
// moves both in one reviewed diff. Overriding it is how the two drift apart,
// so the absence of an apiVersion below is the best practice, not an omission.
const stripeClient = new Stripe(key);

export default stripeClient;
