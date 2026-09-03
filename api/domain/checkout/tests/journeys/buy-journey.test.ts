// THE CUSTOMER BUY JOURNEY (a sales order), over real HTTP as far as an HTTP
// seam and a committed cassette allow - the API-owned replacement for
// frontend/shared/tests/authed/customer-checkout-sales.e2e.ts, extended past
// the point that spec deliberately stopped at (a submitted sale creates a
// real Stripe object even in test mode; ruling 55 retires Playwright, so the
// API must own the rest of the walk, on its own recorded terms).
//
// basket (PUT /api/checkout/items?direction=sale) -> checkout row
// (PATCH /api/checkout) -> payment intent
// (POST /api/stripe/update_payment_intent, a REAL Stripe call replayed from
// stripe/create-payment-intent.json) -> PLACE.
//
// THE INTENT CASSETTE PINS AN AMOUNT, AND THAT IS A NAMED GAP. nock matches a
// cassette's request body verbatim and Stripe's `amount` field is never
// normalised (shared/testing/cassettes.ts), so the only committed Stripe
// cassette that fits ANY basket is the $0-priced, empty-items cold-start path
// domain/payments/tests/update-intent.test.ts already uses (items: [] prices
// under Stripe's minimum, so updatePaymentIntent falls into the $10.00
// placeholder createIntent branch). There is no committed cassette for a
// checkout priced from a real cart, so this journey's Stripe call opens the
// placeholder intent rather than one carrying the basket's own total - see
// docs/waves/api-journeys.md for the full account of the gap and what
// recording the missing scenario would take.
//
// PLACE IS DOMAIN-LEVEL FOR THE SAME REASON THE SELL JOURNEY'S IS: no HTTP
// seam takes a stub World, and placeSale's own `world.authorize` call is a
// real Stripe confirm/capture that this suite must not reach. What IS real:
// placeSale resolves the intent through intentsRepo.findOpenForUser exactly as
// production does - it does not take the intent's id from this test, it finds
// the row the HTTP call above actually wrote.
//
// NOTHING IS COMMITTED: pinned-pool.ts rolls back every query.
import { test, afterAll } from "vitest";
import assert from "node:assert/strict";
import type { PoolClient } from "pg";
import request from "supertest";
import pool from "#db";
import query from "#shared/db/query.ts";
import { mockSessions, restoreSessions, as, asAdmin } from "#shared/testing/session.ts";
import { TEST_ACTOR } from "#shared/testing/actor.ts";
import { inPinnedTransaction } from "#shared/testing/pinned-pool.ts";
import { LOCKS } from "#shared/testing/locks.ts";
import { withCassette } from "#shared/testing/cassettes.ts";
import * as place from "#domain/orders/place.ts";
import {
  aUser, anAdmin, anAddress, aProduct, saleServiceId, paymentMethodId,
} from "#shared/testing/builders/index.ts";

await mockSessions();
const { default: app } = await import("#app");

afterAll(async () => {
  restoreSessions();
  await pool.end();
});

const stubWorld = (): place.World => ({
  buyPostage: async () => ({ netCharge: 0, tracking_number: null, label: null, pickup: null }),
  authorize: async () => {},
  confirm: async () => {},
});

const asCaller = (u: { id: string; name: string | null; email: string | null }) =>
  ({ id: u.id, name: u.name, email: u.email, role: "user" });

test("basket, row, a real intent and placement agree on one sales order", async () => {
  await inPinnedTransaction(async (c: PoolClient) => {
    const built = await aUser(c);
    const customer = asCaller(built);
    const admin = await anAdmin(c);
    const address = await anAddress(c, customer);
    const product = await aProduct(c, { metal: "Gold", content: 1, ask_premium: 60 });
    const service = await saleServiceId(c);
    const method = await paymentMethodId(c, "CARD", "sale");

    // Closes createPaymentIntent's "open a Stripe customer" branch before the
    // request (update-intent.test.ts's own pattern), so the ONLY Stripe call
    // this request makes is the createIntent the cassette answers.
    await query(
      `UPDATE auth.users SET "stripeCustomerId" = $1 WHERE id = $2`,
      ["cus_cassette_buy_journey", built.id], c
    );

    const basket = await as(customer, () =>
      request(app).put("/api/checkout/items").query({ direction: "sale" }).send({
        items: [{ bullion_id: product.id, quantity: 1 }],
      })
    );
    assert.equal(basket.status, 200, basket.text);
    assert.equal(basket.body.length, 1);

    const patched = await as(customer, () =>
      request(app).patch("/api/checkout").send({
        direction: "sale",
        recipient_address_id: address.id,
        carrier_service_id: service,
        payment_method_id: method,
      })
    );
    assert.equal(patched.status, 200, patched.text);
    const checkout_id: string = patched.body.id;

    const intent = await withCassette("stripe/create-payment-intent.json", () =>
      as(customer, () =>
        request(app).post("/api/stripe/update_payment_intent").send({
          items: [], type: "customer", address_id: address.id,
        })
      )
    );
    assert.equal(intent.status, 200, intent.text);
    assert.ok(
      typeof intent.body === "string" && intent.body.startsWith("pi_"),
      `no client_secret came back: ${JSON.stringify(intent.body)}`
    );

    // ---- PLACE (domain-level - see header). placeSale finds the intent
    // above through intentsRepo.findOpenForUser, exactly as production does.
    const placed = await place.place(checkout_id, stubWorld());
    assert.equal(placed.order.direction, "sale");
    assert.equal(placed.items.length, 1);
    assert.equal(placed.items[0]!.bullion_id, product.id);

    const { rows: [attached] } = await c.query(
      `SELECT order_id FROM payments.intents WHERE user_id = $1
        ORDER BY created_at DESC LIMIT 1`,
      [built.id]
    );
    assert.equal(
      attached.order_id, placed.order.id,
      "placement did not attach the intent this HTTP call opened"
    );

    // ---- admin lifecycle: labels only, driving no logic.
    for (const status of ["Preparing", "Shipped", "Cancelled"]) {
      const moved = await asAdmin(admin, () =>
        request(app).patch(`/api/orders/${placed.order.id}`).send({ status })
      );
      assert.equal(moved.status, 200, moved.text);
      assert.equal(moved.body.order.status, status);
    }
  }, { actor: TEST_ACTOR.id, lock: [LOCKS.ORDERS, LOCKS.ADDRESSES, LOCKS.USERS] });
});
