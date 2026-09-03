// No outbound network in a test run. Preloaded via `node --import` (see
// package.json's `test` script) so it runs before ANY test file's own
// imports - a guard that a test could outrun by importing Stripe or axios
// first is not a guard.
//
// *** WHY THIS EXISTS. *** 1.3 of the redesign
// (docs/waves/test-suite-redesign.md) names the hole directly:
// `STRIPE_SECRET_KEY` in the suite's environment is `sk_test_...`, so
// `providers/payment/stripe-client.ts`'s live-key refusal never fires, and
// nothing else stops a test that reaches `stripe.createIntent` from making a
// real network call to Stripe's test mode - non-deterministic, network-
// dependent, and minting the same abandoned `requires_payment_method`
// intents `audit:payments` already complains about. FedEx's guard
// (`providers/shipments/endpoints.ts` `refuseInTests`) throws instead of
// merely being untested, so it does not need this - but a single interceptor
// covering ALL outbound traffic is a cheaper and more general guarantee than
// auditing every provider by hand for its own seam, and it is the one
// `audit:test-leaks`-style backstop this codebase does not yet have for the
// network the way it has one for the database.
//
// *** WHY DISABLE RATHER THAN MOCK EVERYTHING. *** `nock.disableNetConnect()`
// blocks every unmocked host with `NetConnectNotAllowedError` - loud and
// immediate - rather than a mock library that silently answers nothing and
// leaves a test hanging on a timeout. A test that needs a provider response
// records a cassette (lane 5) or stubs the provider's own DI seam (email
// already has one); this file's job is only to make an ungoverned network
// call impossible to miss.
//
// *** THE ONE ALLOWED HOST. *** Postgres on the local cluster
// (127.0.0.1/localhost, any port - preflight-test-db.ts and the pinned pool
// both dial it) is not "the network" for this guard's purposes; it is the
// harness. Nothing else is allowed through, sandbox credentials included -
// `pnpm test:sandbox` and `pnpm test:record` do not load this preload (see
// `test:external`'s own header).
import nock from "nock";

nock.disableNetConnect();
nock.enableNetConnect(/^(127\.0\.0\.1|localhost)(:\d+)?$/);
