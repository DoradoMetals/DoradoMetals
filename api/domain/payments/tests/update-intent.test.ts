// POST /api/stripe/update_payment_intent, over real HTTP, as far as it goes
// without Stripe.
//
// WHY THIS FILE EXISTS. The route answered 500 on every call for eight months.
// features/payments/service.ts awaited addressService.getAddressFromId, a
// function that has not existed since be03eed3 - the December 2025 feature
// slicing - and `import * as` makes a missing export `undefined` rather than an
// import error, so nothing failed until the line ran.
//
// That is the route that prices the cart and tells Stripe what to charge. With
// it dead, the intent keeps the $10.00 placeholder createPaymentIntent opens
// with. No repo test could see this: the repos were fine. No typecheck could
// see it either, because both files were JavaScript.
//
// WHAT THIS ASSERTS, AND WHAT IT CANNOT. The success path ends at Stripe, which
// this suite does not call. So the assertion is the one that matters and is
// reachable: the handler gets PAST the address lookup and the pricing, and the
// failure - when there is one - is not a TypeError about a missing function.
// A 500 whose body points at features/payments is exactly what regressing this
// looks like.
//
// THE LAST TEST WAS SKIPPED (lane 4, docs/waves/test-suite-redesign.md 1.3
// and 2.4): "this suite does not call [Stripe]" used to be true only because
// nothing stopped it - STRIPE_SECRET_KEY is sk_test_, so the call reached
// Stripe's real test-mode API and the test tolerated whatever came back.
// `shared/testing/no-network.ts` (preloaded by the `test` script) blocked
// that outbound call with nock - which is the guard this file always needed -
// but the Stripe SDK's own retry logic did not treat nock's synthetic
// NetConnectNotAllowedError as terminal, so the call that used to complete
// (slowly, over the real network) hung past the per-test timeout instead of
// failing fast.
//
// LANE 5 REPLACES THE HANG WITH A CASSETTE, and turns this into a real
// success-path assertion instead of a "did not crash" one. `items: []`
// prices to $0, which is below Stripe's minimum (D199 - no floor), so
// `updatePaymentIntent` falls into `createPaymentIntent`'s cold-start branch:
// open (or reuse) a Stripe customer, then create a $10.00 placeholder intent.
// Forcing the fixture user's `stripeCustomerId` closed BEFORE the request
// means the only Stripe call this request makes is that createIntent -
// `stripe/create-payment-intent.json`, the same cassette
// providers/payment/tests/stripe-cassettes.test.ts records for the identical
// call shape (amount 1000, metadata.type "customer").
//
// NOTHING IS COMMITTED: shared/testing/pinned-pool.js holds every query in one
// transaction that is rolled back.
import { test, afterAll } from "vitest";
import assert from "node:assert/strict";
import request from "supertest";
import type { PoolClient } from "pg";
import pool from "#pool";
import query from "#shared/db/query.ts";
import { mockSessions, restoreSessions, as } from "#shared/testing/session.ts";
import { TEST_ACTOR } from "#shared/testing/actor.ts";
import { inPinnedTransaction } from "#shared/testing/pinned-pool.ts";
import { LOCKS } from "#shared/testing/locks.ts";
import { withCassette } from "#shared/testing/cassettes.ts";
import { aUser, anAddress } from "#shared/testing/builders/index.ts";
import * as addressService from "#domain/places/addresses/service.ts";

await mockSessions();
const { default: app } = await import("#app");

afterAll(async () => {
  restoreSessions();
  await pool.end();
});

// The unit the route died on, asserted directly so a failure says which half
// broke rather than only that the route is down. Built rather than discovered:
// getAddressFromId reads places.addresses (its own feature's table), so a
// fixture drawn from the frozen exchange.addresses was testing an id that only
// coincidentally lined up across the two schemas.
test("the addresses service can resolve one address by id", async () => {
  assert.equal(
    typeof addressService.getAddressFromId,
    "function",
    "getAddressFromId is missing - domain/payments/service.ts awaits it"
  );

  await inPinnedTransaction(async (c) => {
    const customer = await aUser(c);
    const built = await anAddress(c, customer);

    const address = await addressService.getAddressFromId(built.id);
    assert.ok(address, "a real address id resolved to nothing");
    assert.equal(address.id, built.id, "it returned a different address");
    assert.ok(
      typeof address.state === "string" || address.state === null,
      "the caller reads `address?.state` to decide the tax state"
    );
  }, { actor: TEST_ACTOR.id, lock: LOCKS.ADDRESSES });
});

// An id that matches nothing must come back empty rather than throw: the call
// site is written as `address?.state ?? "TX"`.
test("an unknown address id resolves to nothing rather than throwing", async () => {
  const address = await addressService.getAddressFromId(
    "00000000-0000-4000-8000-000000000000"
  );
  assert.equal(address, undefined, "an unknown id should resolve to undefined");
});

// UN-SKIPPED (lane 5). The success path this file's header describes: a real
// response, played back from a cassette, instead of only checking the route
// did not fall over.
test("update_payment_intent succeeds against a recorded Stripe response", async () => {
  await inPinnedTransaction(async (c: PoolClient) => {
    const customer = await aUser(c);
    const built = await anAddress(c, customer);

    // Closes createPaymentIntent's "open a Stripe customer" branch before the
    // request, so the ONLY Stripe call this request makes is the createIntent
    // the cassette answers. The value itself is arbitrary - the cassette
    // normalises the `customer` field to a fixed placeholder on both the
    // recorded and the live side (shared/testing/cassettes.ts), so nothing
    // here needs to match anything Stripe actually issued.
    await query(
      `UPDATE auth.users SET "stripeCustomerId" = $1 WHERE id = $2`,
      ["cus_cassette_update_intent", customer.id],
      c
    );

    await withCassette("stripe/create-payment-intent.json", () =>
      as(Object.assign({}, customer, { role: "user" }), async () => {
        const res = await request(app)
          .post("/api/stripe/update_payment_intent")
          .send({
            items: [],
            type: "customer",
            address_id: built.id,
          });

        assert.equal(
          res.status, 200,
          `expected 200, got ${res.status}: ${JSON.stringify(res.body)}`
        );
        // The controller responds with just the client_secret (see
        // transport/payments/controller.ts) - the browser's authority to
        // confirm the intent it just opened.
        assert.ok(
          typeof res.body === "string" && res.body.startsWith("pi_"),
          `no client_secret came back: ${JSON.stringify(res.body)}`
        );
      })
    );
  }, { actor: TEST_ACTOR.id, lock: LOCKS.ADDRESSES });
});
