// The payments endpoints, over real HTTP.
//
// TYPE=ADMIN IS A PRIVILEGE, NOT A PARAMETER, and this is where that is kept
// shut: `type` decides WHOSE intent is fetched, and the response body is the
// client_secret a browser confirms a payment with. An admin placing an order
// for a customer is real; claiming it by asking is not.
//
// MOST OF THESE ARE REFUSALS BECAUSE THREE OF THE FOUR SUCCESS PATHS END AT
// STRIPE, and this suite takes no network dependency. Each refusal returns
// from the controller before the service runs, so it covers exactly the
// boundary that was broken. get_sales_order_payment_intent is the exception -
// a pure database read - so it is the one whose response SHAPE is pinned here.
//
// THE ROUTES ARE MOUNTED AT /api/stripe, NOT /api/payments (ruling 13: the URL
// and the file answer different questions). A request to /api/payments answers
// 404, which is not in [401, 403] and reads as a failed guard rather than a
// wrong URL.
//
// NOTHING IS COMMITTED - pinned-pool holds every query in one rolled-back
// transaction.
import { test, afterAll, beforeAll } from "vitest";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import request from "supertest";
import pool from "#db";
import { mockSessions, restoreSessions, as, anonymous } from "#shared/testing/session.ts";
import { TEST_ACTOR } from "#shared/testing/actor.ts";
import { inPinnedTransaction, outside } from "#shared/testing/pinned-pool.ts";
import { anId, aUser, anOrder } from "#shared/testing/builders/index.ts";
import * as paymentsService from "#domain/payments/service.ts";
import { LOCKS } from "#shared/testing/locks.ts";
import { PaymentIntent } from "@dorado/contracts";

await mockSessions();
const { default: app } = await import("#app");

// This file imports #domain/payments/service.ts, which reaches orders.* and
// auth.users through its own dependencies - lint:test-locks derives the
// requirement from the whole file's import graph, not per-call, so every
// inPinnedTransaction below carries it even where a given test builds nothing.
const PAYMENTS_LOCKS = [LOCKS.ORDERS, LOCKS.ADDRESSES, LOCKS.USERS];

// THE STRUCTURAL SUBSET EACH FIXTURE ACTUALLY HAS. These are SELECT
// projections, not table rows.
type UserFixture = { id: string; name: string | null; email: string | null };

let admin: UserFixture;
// MINTED, NOT DISCOVERED. `as()` mocks the SESSION only (session.ts never
// touches the database), and every route these two exercise refuses before a
// repo call - the attack this file is about is the type=admin CLAIM, not
// anything that needs either identity to be a real row. Two distinct minted
// ids do everything a discovered pair would.
const customer: UserFixture = { id: anId(), name: "Replay Customer", email: "replay-customer@dorado.test" };
const victim: UserFixture = { id: anId(), name: "Replay Victim", email: "replay-victim@dorado.test" };
let intentsBefore: number;

beforeAll(async () => {
  admin = TEST_ACTOR;

  // payments.intents, not the frozen exchange.payment_intents - D212 stopped
  // writing the old table, so a count against it can never move.
  const rows = await outside(`SELECT count(*)::int AS n FROM payments.intents`);
  intentsBefore = rows[0].n;
});

afterAll(async () => {
  restoreSessions();
  await pool.end();
});

test("every route refuses an anonymous caller", async () => {
  await inPinnedTransaction(async () => {
    await anonymous(async () => {
      const calls = [
        [
          "retrieve_payment_intent",
          request(app).get("/api/stripe/retrieve_payment_intent").query({ type: "customer" }),
        ],
        [
          "get_sales_order_payment_intent",
          request(app)
            .get("/api/stripe/get_sales_order_payment_intent")
            .query({ sales_order_id: randomUUID() }),
        ],
        [
          "update_payment_intent",
          request(app).post("/api/stripe/update_payment_intent").send({ items: [] }),
        ],
        [
          "cancel_payment_intent",
          request(app).post("/api/stripe/cancel_payment_intent").send({ id: "pi_nope" }),
        ],
      ] as Array<[string, Promise<{ status: number }>]>;
      // Declared as a tuple list: inferred, the element type collapses to
      // `string | Test` and neither half is usable.
      for (const [name, call] of calls) {
        const res = await call;
        assert.ok([401, 403].includes(res.status), `${name} answered ${res.status} anonymously`);
      }
    });
  }, { actor: TEST_ACTOR.id, lock: PAYMENTS_LOCKS });
});

// THE ASSERTION THIS FILE EXISTS FOR.
//
// A signed-in customer claiming type=admin against another user's id must be
// refused, and must be refused with 403 rather than a 200 carrying a
// client_secret. Sent as the real attack: the victim's id, not the caller's.
test("a customer cannot claim type=admin to read another user's payment intent", async () => {
  await inPinnedTransaction(async () => {
    await as(Object.assign({}, customer, { role: "user" }), async () => {
      const res = await request(app)
        .get("/api/stripe/retrieve_payment_intent")
        .query({ type: "admin", user_id: victim.id });

      assert.equal(res.status, 403, `answered ${res.status} to a claimed admin type`);

      // The success shape is a bare client_secret string. Asserting the status
      // alone would miss a refusal that still leaked the body.
      assert.ok(
        typeof res.body !== "string" || !res.body.startsWith("pi_"),
        "a refused request still returned a Stripe client_secret"
      );
      assert.ok(
        !JSON.stringify(res.body ?? "").includes("_secret"),
        "a refused request still returned something secret-shaped"
      );
    });
  }, { actor: TEST_ACTOR.id, lock: PAYMENTS_LOCKS });
});

// The same claim aimed at the caller's OWN id. Still refused - the check is on
// the privilege, not on whether the target happens to be someone else. A check
// written the other way would have passed this and still been broken.
test("a customer cannot claim type=admin even against their own id", async () => {
  await inPinnedTransaction(async () => {
    await as(Object.assign({}, customer, { role: "user" }), async () => {
      const res = await request(app)
        .get("/api/stripe/retrieve_payment_intent")
        .query({ type: "admin", user_id: customer.id });
      assert.equal(res.status, 403, `answered ${res.status} to a claimed admin type`);
    });
  }, { actor: TEST_ACTOR.id, lock: PAYMENTS_LOCKS });
});

test("the two admin-only routes refuse a signed-in customer", async () => {
  await inPinnedTransaction(async () => {
    await as(Object.assign({}, customer, { role: "user" }), async () => {
      const calls = [
        [
          "get_sales_order_payment_intent",
          request(app)
            .get("/api/stripe/get_sales_order_payment_intent")
            .query({ sales_order_id: randomUUID() }),
        ],
        [
          "cancel_payment_intent",
          request(app).post("/api/stripe/cancel_payment_intent").send({ id: "pi_nope" }),
        ],
      ] as Array<[string, Promise<{ status: number }>]>;
      // Declared as a tuple list: inferred, the element type collapses to
      // `string | Test` and neither half is usable.
      for (const [name, call] of calls) {
        const res = await call;
        assert.ok([401, 403].includes(res.status), `${name} answered ${res.status} to a customer`);
      }
    });
  }, { actor: TEST_ACTOR.id, lock: PAYMENTS_LOCKS });
});

// The refusals must not have written anything. Payment intents are rows; a
// guard placed after the write would return the same 403.
test("the refused requests created no payment intent", async () => {
  const rows = await outside(`SELECT count(*)::int AS n FROM payments.intents`);
  assert.equal(
    rows[0].n,
    intentsBefore,
    "a route that answered 401/403 still wrote a payment intent"
  );
});

// THE ONE SUCCESS PATH THAT DOES NOT END AT STRIPE.
//
// An admin reading a sales order's payment intent. This is a database read, so
// it can be asserted here, and it is the only HTTP-level pin this feature's
// one repo-row response has - the addresses feature has already been bitten
// once by a response that was correct until after the controller returned.
//
// Asserted four ways, because a 200 alone would pass against an empty body:
// the response parses through the nested contract, it names the intent the
// database holds for that order, the amounts arrive in DOLLARS, and the legacy
// flat names are absent - there is no adapter left to put them back.
test("an admin reading a sales order's payment intent gets it, in the nested wire shape", async () => {
  await inPinnedTransaction(async (c) => {
    // Built here rather than discovered: the endpoint reads payments.intents
    // through orders.orders (find_for_order.sql), not the frozen
    // exchange.payment_intents this test used to seed itself from - the two
    // tables have diverged since D212, so a fixture drawn from the old one
    // was testing nothing about the live path.
    const buyer = await aUser(c);
    const order = await anOrder(c, buyer, { direction: "sale" });
    const providerRef = `pi_${anId().slice(0, 24)}`;
    await paymentsService.recordIntent(
      { id: providerRef, status: "succeeded", amount: 25000, amount_received: 25000 },
      { session_id: anId(), user_id: buyer.id },
      "checkout",
      undefined,
      c
    );
    assert.ok(
      await paymentsService.attachOrder(providerRef, order.id, c),
      "the built intent did not attach to the built order"
    );

    await as(Object.assign({}, admin, { role: "admin" }), async () => {
      const res = await request(app)
        .get("/api/stripe/get_sales_order_payment_intent")
        .query({ sales_order_id: order.id });

      assert.equal(res.status, 200, `answered ${res.status} to an admin`);
      assert.ok(res.body && typeof res.body === "object", "the body was not an object");

      const parsed = PaymentIntent.safeParse(res.body);
      assert.ok(
        parsed.success,
        "the response does not satisfy the nested contract: " +
          JSON.stringify(parsed.error?.issues?.slice(0, 4))
      );

      // The right intent, not merely a well-shaped one.
      assert.equal(
        res.body.attempt?.provider_ref,
        providerRef,
        "a different intent came back"
      );

      // DOLLARS. Stripe speaks cents; the wire is the internal shape now, and
      // a flatten reappearing would announce itself as a hundredfold error.
      assert.equal(Number(res.body.amount_expected), 250, "the wire is not in dollars");

      // The legacy names are gone, and so is the one field that must never
      // come back: a bank routing number was on the old wire only because the
      // exchange read was SELECT *.
      assert.ok(!("payment_intent_id" in res.body), "the legacy names came back to the wire");
      assert.ok(!("payment_status" in res.body), "the legacy names came back to the wire");
      assert.ok(
        !/"routing"/.test(JSON.stringify(res.body)),
        "a routing key reached the wire"
      );
    });
  }, { actor: TEST_ACTOR.id, lock: PAYMENTS_LOCKS });
});

// A GAP, STATED RATHER THAN PAPERED OVER.
//
// There is no test here that an ADMIN is allowed PAST the type check, and the
// first version of this file tried to write one. It hung for two minutes and
// was killed.
//
// The reason constrains every future test of this feature, so it is recorded
// rather than dropped. retrievePaymentIntent calls auth.api.getSession
// directly, and better-auth reads through ITS OWN pool - mockSessions patches
// the middleware, not that. So under test the session resolves to nothing, the
// repo finds no attempt, and the service falls through to createPaymentIntent,
// which creates a Stripe customer and an intent OVER THE NETWORK.
//
// The allowed path therefore cannot be asserted without reaching Stripe. That
// belongs in the sandbox integration suite, not in a file whose premise is that
// it touches nothing outside this database.
//
// What is lost: if the guard were changed to refuse everyone, these tests would
// still pass. What is not: refusing a customer IS the security property, and
// the 403 from the type check is a different code path from requireUser's 401,
// which the anonymous test above covers - so a blanket refusal would not look
// like this.

