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
// THE LAST TEST IS SKIPPED (lane 4, docs/waves/test-suite-redesign.md 1.3 and
// 2.4): "this suite does not call [Stripe]" used to be true only because
// nothing stopped it - STRIPE_SECRET_KEY is sk_test_, so the call reached
// Stripe's real test-mode API and the test tolerated whatever came back.
// `shared/testing/no-network.ts` (preloaded by the `test` script) now blocks
// that outbound call with nock - which is the guard this file always needed -
// but the Stripe SDK's own retry logic does not treat nock's synthetic
// NetConnectNotAllowedError as terminal, so the call that used to complete
// (slowly, over the real network) now hangs past node:test's own per-test
// timeout instead of failing fast. Confirmed in isolation: the other two
// tests in this file pass in under 20ms each; this one only stops via the
// timeout, never rejects on its own. Lane 5 ("replay") is where this gets a
// real fix - a recorded cassette for `update_payment_intent`'s success shape,
// so the assertion below runs against a response instead of a live socket.
//
// NOTHING IS COMMITTED: shared/testing/pinned-pool.js holds every query in one
// transaction that is rolled back.
import test, { after, before } from "node:test";
import assert from "node:assert/strict";
import request from "supertest";
import pool from "#db";
import { mockSessions, restoreSessions, as } from "#shared/testing/session.ts";
import { inPinnedTransaction, outside } from "#shared/testing/pinned-pool.ts";
import { LOCKS } from "#shared/testing/locks.ts";
import * as addressService from "#domain/places/addresses/service.ts";

await mockSessions();
const { default: app } = await import("#app");

// THE STRUCTURAL SUBSET THE FIXTURE QUERIES ASK FOR.
type UserFixture = { id: string; name: string | null; email: string | null };

let customer: UserFixture;
let addressId: string;

before(async () => {
  const users = await outside<UserFixture>(
    `SELECT u.id, u.name, u.email FROM exchange.users u
      WHERE u.role IS DISTINCT FROM 'admin'
        AND EXISTS (SELECT 1 FROM exchange.addresses a WHERE a.user_id = u.id)
      LIMIT 1`
  );
  customer = users[0];
  assert.ok(customer, "dev needs a non-admin user with an address");

  const rows = await outside(
    `SELECT id FROM exchange.addresses WHERE user_id = $1 ORDER BY id LIMIT 1`,
    [customer.id]
  );
  addressId = rows[0]?.id;
  assert.ok(addressId, "dev needs an address for that user");
});

after(async () => {
  restoreSessions();
  await pool.end();
});

// The unit the route died on, asserted directly so a failure says which half
// broke rather than only that the route is down.
test("the addresses service can resolve one address by id", async () => {
  assert.equal(
    typeof addressService.getAddressFromId,
    "function",
    "getAddressFromId is missing - domain/payments/service.ts awaits it"
  );

  const address = await addressService.getAddressFromId(addressId);
  assert.ok(address, "a real address id resolved to nothing");
  assert.equal(address.id, addressId, "it returned a different address");
  assert.ok(
    typeof address.state === "string" || address.state === null,
    "the caller reads `address?.state` to decide the tax state"
  );
});

// An id that matches nothing must come back empty rather than throw: the call
// site is written as `address?.state ?? "TX"`.
test("an unknown address id resolves to nothing rather than throwing", async () => {
  const address = await addressService.getAddressFromId(
    "00000000-0000-4000-8000-000000000000"
  );
  assert.equal(address, undefined, "an unknown id should resolve to undefined");
});

test("update_payment_intent no longer dies before it reaches Stripe", {
  skip: "reaches Stripe for real (sk_test_, no DI seam) and shared/testing/" +
    "no-network.ts now blocks that - the Stripe SDK's retry logic does not " +
    "resolve against nock's refusal, so this hangs past the per-test timeout " +
    "instead of failing. Lane 5 replaces it with a cassette; see this file's " +
    "header.",
}, async () => {
  await inPinnedTransaction(async () => {
    const customerId = customer.id;
    await as(Object.assign({}, customer, { role: "user" }), async () => {
      const res = await request(app)
        .post("/api/stripe/update_payment_intent")
        .send({
          items: [],
          using_funds: false,
          type: "customer",
          user: { id: customerId },
          address_id: addressId,
        });

      // Not asserting 200: the success path ends at Stripe and this suite does
      // not call it. What must never come back is the route falling over inside
      // domain/payments before any of that.
      const where = res.body?.error?.where ?? "";
      assert.ok(
        !where.includes("domain/payments/service"),
        `update_payment_intent failed inside the service itself: ${where}`
      );
      assert.ok(
        !JSON.stringify(res.body ?? "").includes("is not a function"),
        "the handler called something that does not exist"
      );
    });
  }, { lock: LOCKS.ADDRESSES });
});
