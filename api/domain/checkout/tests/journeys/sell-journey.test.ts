import { test, afterAll } from "vitest";
import assert from "node:assert/strict";
import type { PoolClient } from "pg";
import request from "supertest";
import pool from "#pool";
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

const stubWorld = (): typeof place.LIVE => ({
  buyLabel: async () => {},
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

    const opened = await as(customer, () =>
      request(app).get("/api/checkout").query({ direction: "purchase" })
    );
    assert.equal(opened.status, 200, opened.text);
    const checkout_id: string = opened.body.id;
    assert.deepEqual(
      opened.body.missing,
      ["fulfillment_id", "payment_details_id"],
      "missing is not the outstanding steps, in stepper order"
    );

    const fulfillment = await as(customer, () =>
      request(app).post("/api/fulfillments").send({
        checkout_id, method_id: dropoffMethod,
      })
    );
    assert.equal(fulfillment.status, 200, fulfillment.text);
    const fulfillment_id: string = fulfillment.body.fulfillment.id;
    assert.ok(fulfillment_id, "no draft fulfillment was minted");

    const parcel = await as(customer, () =>
      request(app).patch(`/api/fulfillments/${fulfillment_id}`).send({
        shipment: {
          package_id: pkg,
          carrier_service_id: service,
          shipper_address_id: address.id,
        },
      })
    );
    assert.equal(parcel.status, 200, parcel.text);
    assert.deepEqual(parcel.body.missing, []);

    const withDraft = await as(customer, () =>
      request(app).get("/api/checkout").query({ direction: "purchase" })
    );
    assert.deepEqual(withDraft.body.missing, ["payment_details_id"]);

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
    assert.deepEqual(payout.body.missing, []);

    const placed = await place.place(checkout_id, stubWorld());
    assert.equal(placed.order.direction, "purchase");
    assert.equal(placed.order.status, "In Transit");
    assert.equal(placed.items.length, 2, "the order lost a line the checkout carried");

    const bullionLine = placed.items.find((i) => i.bullion_id === product.id)!;
    assert.ok(bullionLine, "the bullion line did not survive placement");
    assert.notEqual(
      Number(bullionLine.premium), Number(product.bid_premium),
      "the placed bullion line kept the catalogue's own premium"
    );

    const payoutsOnOrder = await as(customer, () =>
      request(app).get(`/api/orders/${placed.order.id}/payment-details`)
    );
    assert.equal(payoutsOnOrder.status, 200, payoutsOnOrder.text);
    assert.ok(Array.isArray(payoutsOnOrder.body) && payoutsOnOrder.body.length > 0,
      "the order carries no payout after a purchase placement with one attached"
    );
    const wire = JSON.stringify(payoutsOnOrder.body);
    assert.ok(wire.includes("6789"), "the last four never reached the order's own payout read");
    assert.equal(wire.includes("000123456789"), false, "the full account number reached the order read");

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

    for (const status of ["Received", "Cancelled"]) {
      const moved = await asAdmin(admin, () =>
        request(app).patch(`/api/orders/${placed.order.id}`).send({ status })
      );
      assert.equal(moved.status, 200, moved.text);
      assert.equal(moved.body.order.status, status);
    }
  }, { actor: TEST_ACTOR.id, lock: [LOCKS.ORDERS, LOCKS.ADDRESSES, LOCKS.FULFILLMENTS, LOCKS.USERS] });
});
