// The payments endpoints, over real HTTP.
//
// This is the feature where a wrong answer is a wrong amount of money, and it
// holds the sharpest of the authorization bugs: TYPE WAS A PRIVILEGE CLAIMED BY
// ASKING.
//
// retrieve_payment_intent is requireUser, and the repos read
//
//   type === "admin" ? user_id : session.user.id
//
// so `type` decided WHOSE intent was fetched. A signed-in customer could send
// type=admin with somebody else's user_id and receive their payment intent -
// and the response body is the Stripe object's client_secret, which is the
// credential a browser uses to confirm a payment. The type still selects the
// flow, because an admin placing an order on a customer's behalf is real; it
// just cannot be claimed.
//
// WHY THE REFUSALS ARE THE TESTS, AND WHY THAT IS ENOUGH HERE. Every success
// path in this feature ends at Stripe. The suite does not call Stripe - the
// provider now refuses a live key under test, and the sandbox is a network
// dependency this file deliberately does not take. Every refusal below returns
// from the controller BEFORE the service runs, so the assertions cover exactly
// the boundary that was broken, deterministically.
//
// THE ROUTES ARE MOUNTED AT /api/stripe, NOT /api/payments. The feature was
// renamed; the path deliberately was not, because the frontend calls it and
// renaming a module is not a reason to change the API (app.js says so). The
// first version of this file inferred the path from the feature name, sent
// every request to /api/payments, got 404 for all of them - and 404 is not in
// [401, 403], so it read as four failures rather than as a wrong URL.
//
// NOTHING IS COMMITTED. shared/testing/pinned-pool.js holds every query in one
// transaction that is rolled back.
import test, { after, before } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import request from "supertest";
import pool from "#db";
import { mockSessions, restoreSessions, as, anonymous } from "#shared/testing/session.js";
import { inPinnedTransaction, outside } from "#shared/testing/pinned-pool.js";

await mockSessions();
const { default: app } = await import("#app");

let admin;
let customer;
let victim;
let intentsBefore;

before(async () => {
  const admins = await outside(
    `SELECT id, name, email FROM exchange.users WHERE role = 'admin' LIMIT 1`
  );
  admin = admins[0];
  assert.ok(admin, "dev has no admin user");

  const users = await outside(
    `SELECT id, name, email FROM exchange.users WHERE role IS DISTINCT FROM 'admin' LIMIT 2`
  );
  [customer, victim] = users;
  assert.ok(customer && victim, "dev needs two non-admin users - one to attack the other");
  assert.notEqual(customer.id, victim.id);

  const rows = await outside(`SELECT count(*)::int AS n FROM exchange.payment_intents`);
  intentsBefore = rows[0].n;
});

after(async () => {
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
      ];
      for (const [name, call] of calls) {
        const res = await call;
        assert.ok([401, 403].includes(res.status), `${name} answered ${res.status} anonymously`);
      }
    });
  });
});

// THE ASSERTION THIS FILE EXISTS FOR.
//
// A signed-in customer claiming type=admin against another user's id must be
// refused, and must be refused with 403 rather than a 200 carrying a
// client_secret. Sent as the real attack: the victim's id, not the caller's.
test("a customer cannot claim type=admin to read another user's payment intent", async () => {
  await inPinnedTransaction(async () => {
    await as({ ...customer, role: "user" }, async () => {
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
  });
});

// The same claim aimed at the caller's OWN id. Still refused - the check is on
// the privilege, not on whether the target happens to be someone else. A check
// written the other way would have passed this and still been broken.
test("a customer cannot claim type=admin even against their own id", async () => {
  await inPinnedTransaction(async () => {
    await as({ ...customer, role: "user" }, async () => {
      const res = await request(app)
        .get("/api/stripe/retrieve_payment_intent")
        .query({ type: "admin", user_id: customer.id });
      assert.equal(res.status, 403, `answered ${res.status} to a claimed admin type`);
    });
  });
});

test("the two admin-only routes refuse a signed-in customer", async () => {
  await inPinnedTransaction(async () => {
    await as({ ...customer, role: "user" }, async () => {
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
      ];
      for (const [name, call] of calls) {
        const res = await call;
        assert.ok([401, 403].includes(res.status), `${name} answered ${res.status} to a customer`);
      }
    });
  });
});

// The refusals must not have written anything. Payment intents are rows; a
// guard placed after the write would return the same 403.
test("the refused requests created no payment intent", async () => {
  const rows = await outside(`SELECT count(*)::int AS n FROM exchange.payment_intents`);
  assert.equal(
    rows[0].n,
    intentsBefore,
    "a route that answered 401/403 still wrote a payment intent"
  );
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

