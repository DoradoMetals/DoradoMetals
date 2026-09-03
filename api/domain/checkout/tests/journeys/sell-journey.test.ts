// THE CUSTOMER SELL JOURNEY (a purchase order), over real HTTP as far as an
// HTTP seam exists - the API-owned replacement for
// frontend/shared/tests/authed/customer-checkout-purchase.e2e.ts, extended
// past the point that spec deliberately stopped at (placing was Playwright's
// one line it could never cross - a label and an email are real side
// effects; ruling 55 retires it, so the API must own the rest of the walk).
//
// basket (PUT /api/checkout/items?direction=purchase, a scrap line AND a
// bullion line, ruling 51) -> checkout row (PATCH /api/checkout) ->
// fulfillment (POST /api/checkout/fulfillment) -> payout
// (POST /api/checkout/payout, sealed, last-four only) -> PLACE.
//
// PLACE IS DOMAIN-LEVEL, NOT HTTP, AND THAT IS A DECISION, NOT A SHORTCUT.
// POST /api/purchase_orders/create_from_checkout reaches place.place(checkout_id)
// with NO way to inject a stub world (transport/orders/controller.ts calls it
// with zero arguments), so a real HTTP call here would buy a real FedEx label
// and send a real email - exactly what domain/orders/tests/place.test.ts's own
// header says a use case "does not owe its tests a private entrance" over.
// Every step BEFORE this one, and every admin step AFTER it, is real HTTP.
//
// MONEY FACTS: the order's line premiums are NOT the checkout's browser-sent
// premium (ruling from 2026-09-03 - a placed line always takes the rate
// band); the payout HTTP read carries the last four only, never the full
// number; finalize_pricing's total and add_funds' credit agree with each
// other and with the ledger.
//
// NOTHING IS COMMITTED: pinned-pool.ts rolls back every query.
import { test, afterAll } from "vitest";
import assert from "node:assert/strict";
import type { PoolClient } from "pg";
import request from "supertest";
import pool from "#db";
import { mockSessions, restoreSessions, as, asAdmin } from "#shared/testing/session.ts";
import { TEST_ACTOR } from "#shared/testing/actor.ts";
import { inPinnedTransaction } from "#shared/testing/pinned-pool.ts";
import { LOCKS } from "#shared/testing/locks.ts";
import * as place from "#domain/orders/place.ts";
import {
  aUser, anAdmin, anAddress, aProduct, metalId,
  packageId, carrierServiceId, fulfillmentMethodId,
} from "#shared/testing/builders/index.ts";

await mockSessions();
const { default: app } = await import("#app");

afterAll(async () => {
  restoreSessions();
  await pool.end();
});

// The stub world every domain-level placement test in this suite uses
// (place.test.ts) - the two calls that leave the building, answered rather
// than reached.
const stubWorld = (): place.World => ({
  buyPostage: async () => ({
    netCharge: 18.25, tracking_number: "794555000111", label: null, pickup: null,
  }),
  authorize: async () => {},
  confirm: async () => {},
});

const asCaller = (u: { id: string; name: string | null; email: string | null }) =>
  ({ id: u.id, name: u.name, email: u.email, role: "user" });

test("basket, row, fulfillment, payout and placement agree on one order's money", async () => {
  await inPinnedTransaction(async (c: PoolClient) => {
    const customer = asCaller(await aUser(c));
    const admin = await anAdmin(c);
    const address = await anAddress(c, customer);
    const product = await aProduct(c, { metal: "Silver", content: 10, bid_premium: 0.4 });
    const gold = await metalId(c, "Gold");
    const pkg = await packageId(c, "Small Box");
    const service = await carrierServiceId(c, "Express Saver");
    const dropoffMethod = await fulfillmentMethodId(c, "CARRIER DROPOFF", "purchase");

    // ---- the basket: a scrap line AND a bullion line (ruling: a purchase
    // order carries both kinds, and a spec that only ever exercises one
    // never notices the other breaking).
    const basket = await as(customer, () =>
      request(app).put("/api/checkout/items").query({ direction: "purchase" }).send({
        items: [
          { metal_id: gold, pre_melt: 10, purity: 0.925, unit: "g", quantity: 1 },
          { bullion_id: product.id, quantity: 1 },
        ],
      })
    );
    assert.equal(basket.status, 200, basket.text);
    assert.equal(basket.body.length, 2, "the basket did not keep both lines");

    // ---- the row: package, carrier service, shipper address.
    const patched = await as(customer, () =>
      request(app).patch("/api/checkout").send({
        direction: "purchase",
        package_id: pkg,
        carrier_service_id: service,
        shipper_address_id: address.id,
        declared_value: 1500,
        package_weight: 3,
      })
    );
    assert.equal(patched.status, 200, patched.text);
    const checkout_id: string = patched.body.id;

    // ---- the fulfillment: a live draft, attached to the row.
    const fulfillment = await as(customer, () =>
      request(app).post("/api/checkout/fulfillment").send({
        direction: "purchase", method_id: dropoffMethod,
      })
    );
    assert.equal(fulfillment.status, 200, fulfillment.text);
    assert.ok(fulfillment.body.fulfillment_id, "no draft fulfillment was minted");

    // ---- the payout: sealed at rest, last-four answered, never the number.
    const payout = await as(customer, () =>
      request(app).post("/api/checkout/payout").send({
        direction: "purchase",
        method: "ACH",
        account_holder_name: "Journey Test",
        bank_name: "Test Bank",
        account_type: "Checking",
        routing_number: "021000021",
        account_number: "000123456789",
      })
    );
    assert.equal(payout.status, 200, payout.text);
    assert.equal(
      JSON.stringify(payout.body).includes("000123456789"), false,
      "the full account number reached the wire"
    );

    // ---- PLACE (domain-level - see header).
    const placed = await place.place(checkout_id, stubWorld());
    assert.equal(placed.order.direction, "purchase");
    assert.equal(placed.order.status, "In Transit");
    assert.equal(placed.items.length, 2, "the order lost a line the checkout carried");

    // The bullion line's premium is the rate band, never the catalogue's own
    // bid premium the basket carried (2026-09-03 ruling, place.test.ts's own
    // assertion on the same rule).
    const bullionLine = placed.items.find((i) => i.bullion_id === product.id)!;
    assert.ok(bullionLine, "the bullion line did not survive placement");
    assert.notEqual(
      Number(bullionLine.premium), Number(product.bid_premium),
      "the placed bullion line kept the catalogue's own premium"
    );

    // ---- the payout HTTP read carries last-four only.
    const payoutsOnOrder = await as(customer, () =>
      request(app).get(`/api/orders/${placed.order.id}/payouts`)
    );
    assert.equal(payoutsOnOrder.status, 200, payoutsOnOrder.text);
    assert.ok(Array.isArray(payoutsOnOrder.body) && payoutsOnOrder.body.length > 0,
      "the order carries no payout after a purchase placement with one attached"
    );
    const wire = JSON.stringify(payoutsOnOrder.body);
    assert.ok(wire.includes("6789"), "the last four never reached the order's own payout read");
    assert.equal(wire.includes("000123456789"), false, "the full account number reached the order read");

    // ---- admin: finalize pricing (real spots, no provider) and add funds.
    await c.query(`UPDATE orders.orders SET spots_locked = true WHERE id = $1`, [placed.order.id]);
    const priced = await asAdmin(admin, () =>
      request(app).post(`/api/orders/${placed.order.id}/finalize_pricing`)
    );
    assert.equal(priced.status, 200, priced.text);
    const total = Number(priced.body.totals?.total);
    assert.ok(Number.isFinite(total), "finalize_pricing wrote no readable total");

    const funded = await asAdmin(admin, () =>
      request(app).post(`/api/orders/${placed.order.id}/add_funds`)
    );
    assert.equal(funded.status, 200, funded.text);
    const { rows: [ledgerRow] } = await c.query(
      `SELECT amount FROM payments.ledger WHERE order_id = $1 AND type = 'Credit'`,
      [placed.order.id]
    );
    assert.equal(
      Number(ledgerRow.amount), total,
      "the ledger credit does not agree with the priced total"
    );

    // ---- admin lifecycle: labels only, driving no logic.
    for (const status of ["Received", "Cancelled"]) {
      const moved = await asAdmin(admin, () =>
        request(app).patch(`/api/orders/${placed.order.id}`).send({ status })
      );
      assert.equal(moved.status, 200, moved.text);
      assert.equal(moved.body.order.status, status);
    }
  }, { actor: TEST_ACTOR.id, lock: [LOCKS.ORDERS, LOCKS.ADDRESSES, LOCKS.FULFILLMENTS, LOCKS.USERS] });
});
