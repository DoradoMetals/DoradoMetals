// THE VISITOR'S JOURNEY, OVER REAL HTTP (ruling 63: "Fuck it, go for it. We'll
// need it anyway." / "Frontend stores should be for UI elements, not data.").
//
// A signed-out visitor is a better-auth ANONYMOUS user with an ordinary
// auth.users row, so the whole checkout is ordinary rows under an ordinary id.
// What this file pins is that the API cannot tell the difference until it
// matters: the same basket endpoints, the same refusals from the rate surface,
// the same readiness - and then two deliberate walls (the payout step and the
// placement), and a sign-up that carries everything onto the real account.
//
// THE SESSION IS MOCKED, THE ANONYMITY IS NOT. shared/testing/session.ts
// replaces what auth.api.getSession answers, exactly as every other guarded
// test does - better-auth builds its own Pool and a real sign-in would have to
// COMMIT. The `isAnonymous` fact the guards read is a COLUMN, read from the
// database inside the transaction, so the walls below are the real ones.
//
// THE LIVE CARRIER CALL IS NOT MADE, for the reason
// domain/shipping/operations/tests/checkout-rates.test.ts's header gives: no
// cassette matches this endpoint's own request shape. What is pinned here is
// that a visitor reaches the SAME refusals a customer does and that the row
// says `ready_for_rates` when it is ready - the endpoint does not branch on who
// is asking, so there is nothing anonymous-specific left in the carrier call.
import { test, afterAll } from "vitest";
import assert from "node:assert/strict";
import type { PoolClient } from "pg";
import request from "supertest";
import pool from "#pool";
import { mockSessions, restoreSessions, as } from "#shared/testing/session.ts";
import { TEST_ACTOR } from "#shared/testing/actor.ts";
import { inPinnedTransaction } from "#shared/testing/pinned-pool.ts";
import { LOCKS } from "#shared/testing/locks.ts";
import {
  aProduct, aUser, aVisitor, anAddress, packageId,
} from "#shared/testing/builders/index.ts";
import { adoptAnonymousCheckout } from "#domain/checkout/adopt.ts";
import * as checkoutService from "#domain/checkout/service.ts";

await mockSessions();
const { default: app } = await import("#app");

afterAll(async () => {
  restoreSessions();
  await pool.end();
});

const HERE = [LOCKS.ORDERS, LOCKS.ADDRESSES];

test("a visitor builds a basket, is refused the two things that need an account, then signs up and keeps it", async () => {
  await inPinnedTransaction(async (c: PoolClient) => {
    const visitor = await aVisitor(c);
    const product = await aProduct(c);
    const address = await anAddress(c, visitor);
    const box = await packageId(c, "Small Box");

    // ---- 1. THE BASKET. The same endpoint a customer uses; no local store,
    // no merge on sign-in, no second code path.
    const put = await as(visitor, () =>
      request(app)
        .put("/api/checkout/items")
        .query({ direction: "purchase" })
        .send({ items: [{ bullion_id: product.id, quantity: 2 }] })
    );
    assert.equal(put.status, 200, put.text);
    assert.equal(put.body.length, 1);

    const row = await as(visitor, () =>
      request(app).get("/api/checkout").query({ direction: "purchase" })
    );
    assert.equal(row.status, 200, row.text);
    assert.equal(row.body.item_count, 1);
    assert.equal(row.body.ready_to_place, false);

    // ---- 2. THE RATE SURFACE answers a visitor the way it answers anyone:
    // with its own refusal about the checkout, not about who is asking.
    const tooEarly = await as(visitor, () =>
      request(app).get("/api/checkout/rates").query({ direction: "purchase" })
    );
    assert.equal(tooEarly.status, 422, tooEarly.text);
    assert.match(tooEarly.body?.error?.message ?? "", /choose a package/);

    // ---- 3. READINESS. An address the visitor entered and a box: the row
    // itself says the carrier can now be asked.
    const patched = await as(visitor, () =>
      request(app).patch("/api/checkout").send({
        direction: "purchase", package_id: box, shipper_address_id: address.id,
      })
    );
    assert.equal(patched.status, 200, patched.text);
    assert.equal(
      patched.body.ready_for_rates, true,
      "items + a package + an address is the whole of ready_for_rates, and a " +
        "visitor reaches it on the same three writes a customer does"
    );

    // ---- 4. THE FIRST WALL: bank details are sealed against a user id, and a
    // visitor's id is about to be swept.
    const payout = await as(visitor, () =>
      request(app).post("/api/checkout/payout").send({
        direction: "purchase",
        method: "ACH",
        account_holder_name: "A Visitor",
        routing_number: "021000021",
        account_number: "123456789",
        account_type: "Checking",
      })
    );
    assert.equal(payout.status, 403, payout.text);
    assert.match(payout.body?.error?.message ?? "", /sign in to save a payout account/);

    // ---- 5. THE SECOND WALL: placing takes money and buys a label.
    const placed = await as(visitor, () =>
      request(app)
        .post("/api/purchase_orders/create_from_checkout")
        .send({ checkout_id: row.body.id })
    );
    assert.equal(placed.status, 403, placed.text);
    assert.match(placed.body?.error?.message ?? "", /sign in to place an order/);

    // ---- 6. THE SIGN-UP. better-auth mints the real user and calls
    // onLinkAccount, which is this call (domain/auth/client.ts). Everything the
    // visitor did is the customer's afterwards.
    const customer = await aUser(c);
    await adoptAnonymousCheckout(
      { anonymousUserId: visitor.id, userId: customer.id }, c
    );

    const mine = await as(customer, () =>
      request(app).get("/api/checkout/items").query({ direction: "purchase" })
    );
    assert.equal(mine.status, 200, mine.text);
    assert.equal(mine.body.length, 1);
    assert.equal(mine.body[0].bullion_id, product.id);
    assert.equal(Number(mine.body[0].quantity), 2);

    const myRow = await as(customer, () =>
      request(app).get("/api/checkout").query({ direction: "purchase" })
    );
    assert.equal(myRow.status, 200, myRow.text);
    assert.equal(myRow.body.id, row.body.id, "the same checkout row, re-keyed");
    assert.equal(myRow.body.package_id, box);
    assert.equal(myRow.body.shipper_address_id, address.id);

    // And now the wall is down. THE CONTROL, asserted at the guard rather
    // than by placing: a real placement buys a FedEx label and sends an email
    // (sell-journey.test.ts's header explains why the HTTP create has no stub
    // world), and what is in question here is only who is asking.
    await checkoutService.assertRealAccount(customer.id, "place an order");

    // The visitor is left owning nothing at all.
    const { rows: left } = await c.query(
      `SELECT 1 FROM checkout.checkouts WHERE user_id = $1
        UNION ALL
       SELECT 1 FROM places.user_addresses WHERE user_id = $1`,
      [visitor.id]
    );
    assert.deepEqual(left, [], "nothing is left hanging off the visitor's id");
  }, { actor: TEST_ACTOR.id, lock: HERE });
});

test("a visitor's writes are attributed to nobody", async () => {
  // Migration 122: every *_by_id column is a foreign key onto auth.users, so a
  // row stamped with a visitor's id would pin that visitor's row in place for
  // the life of the row it stamped, and the sweep would raise 23503 forever
  // after. It is also the truth - nobody learns anything from "created by
  // Anonymous".
  await inPinnedTransaction(async (c: PoolClient) => {
    const visitor = await aVisitor(c);
    const product = await aProduct(c);
    const put = await as(visitor, () =>
      request(app)
        .put("/api/checkout/items")
        .query({ direction: "purchase" })
        .send({ items: [{ bullion_id: product.id, quantity: 1 }] })
    );
    assert.equal(put.status, 200, put.text);

    const { rows } = await c.query(
      `SELECT i.created_by, i.updated_by
         FROM checkout.items i
         JOIN checkout.checkouts ch ON ch.id = i.checkout_id
        WHERE ch.user_id = $1`,
      [visitor.id]
    );
    assert.equal(rows.length, 1);
    assert.equal(rows[0].created_by, null);
    assert.equal(rows[0].updated_by, null);
  }, { actor: TEST_ACTOR.id, lock: HERE });
});

test("a real customer is still stamped", async () => {
  // The control. Without it the assertion above passes just as well against an
  // audit trigger that has stopped stamping anybody.
  await inPinnedTransaction(async (c: PoolClient) => {
    const customer = await aUser(c, { name: "Stamped Person" });
    const product = await aProduct(c);
    const put = await as(customer, () =>
      request(app)
        .put("/api/checkout/items")
        .query({ direction: "purchase" })
        .send({ items: [{ bullion_id: product.id, quantity: 1 }] })
    );
    assert.equal(put.status, 200, put.text);

    const { rows } = await c.query(
      `SELECT i.created_by
         FROM checkout.items i
         JOIN checkout.checkouts ch ON ch.id = i.checkout_id
        WHERE ch.user_id = $1`,
      [customer.id]
    );
    assert.equal(rows[0].created_by, "Stamped Person");
  }, { actor: TEST_ACTOR.id, lock: HERE });
});
