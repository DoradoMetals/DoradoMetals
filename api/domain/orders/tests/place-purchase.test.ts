import { test, afterAll } from "vitest";
import assert from "node:assert/strict";
import type { PoolClient } from "pg";
import request from "supertest";
import pool from "#pool";
import { mockSessions, restoreSessions, as } from "#shared/testing/session.ts";
import { TEST_ACTOR } from "#shared/testing/actor.ts";
import { inPinnedTransaction } from "#shared/testing/pinned-pool.ts";
import {
  aUser, anAddress, aProduct, packageId, carrierServiceId, saleServiceId,
  fulfillmentMethodId,
} from "#shared/testing/builders/index.ts";
import { LOCKS } from "#shared/testing/locks.ts";
import { open, aadFor } from "#shared/crypto/envelope.ts";
import { payoutKeyFromEnv } from "#shared/crypto/payoutKey.ts";
import { paymentMethodId } from "#shared/testing/builders/reference.ts";

await mockSessions();
const { default: app } = await import("#app");
const place = await import("#domain/orders/place.ts");
const checkoutService = await import("#domain/checkout/service.ts");

type UserFixture = { id: string };

type Fixtures = {
  customer: UserFixture;
  customerName: string | null;
  addressId: string;
  packageId: string;
  labelServiceId: string;
  saleServiceId: string;
  dropoffMethodId: string;
  pickupMethodId: string;
  directMethodId: string;
  productId: string;
};

const aWorld = async (c: PoolClient): Promise<Fixtures> => {
  const customer = await aUser(c, { name: "Row Flow Customer" });
  const address = await anAddress(c, customer);
  const product = await aProduct(c);
  return {
    customer: { id: customer.id },
    customerName: customer.name,
    addressId: address.id,
    packageId: await packageId(c, "Small Box"),
    labelServiceId: await carrierServiceId(c, "Express Saver"),
    saleServiceId: await saleServiceId(c),
    dropoffMethodId: await fulfillmentMethodId(c, "CARRIER DROPOFF", "purchase"),
    pickupMethodId: await fulfillmentMethodId(c, "CARRIER PICKUP", "purchase"),
    directMethodId: await fulfillmentMethodId(c, "PICKUP", "purchase"),
    productId: product.id,
  };
};

const payoutForm = (routing_number = "021000021", account_number = "000123456789") => ({
  direction: "purchase",
  method: "ACH",
  account_holder_name: "Row Flow Test",
  bank_name: "Test Bank",
  account_type: "Checking",
  routing_number,
  account_number,
});
const PAYOUT = payoutForm();

function carrier() {
  const asked: string[] = [];
  const world: typeof place.LIVE = {
    buyLabel: async (shipment_id) => {
      asked.push(shipment_id);
    },
    authorize: async () => {},
    confirm: async () => {},
  };
  return { world, asked };
}

async function shellFor(c: PoolClient, order_id: string) {
  const { rows: [shell] } = await c.query(
    `SELECT s.id, s.carrier_service_id, s.package_id, s.pickup_type, s.insured,
            s.declared_value, s.tracking_number, s.pickup_date, s.pickup_time,
            s.direction::text AS direction
       FROM shipping.shipments s
       JOIN fulfillments.shipments fs ON fs.shipment_id = s.id
       JOIN fulfillments.fulfillments f ON f.id = fs.fulfillment_id
      WHERE f.order_id = $1`,
    [order_id]
  );
  return shell;
}

afterAll(async () => {
  await restoreSessions();
  await pool.end();
});

async function primeCheckout(
  fixtures: Fixtures,
  methodId: string,
  { schedule = false }: { schedule?: boolean } = {}
) {
  const { customer, addressId, packageId, labelServiceId, productId } = fixtures;
  const row = await checkoutService.getRowFor(customer.id, "purchase");

  const ff = await as(customer, () =>
    request(app).post("/api/fulfillments").send({
      checkout_id: row.id,
      method_id: methodId,
    })
  );
  assert.equal(ff.status, 200, ff.text);
  const fulfillment_id = ff.body.fulfillment.id as string;

  if (ff.body.method.category === "SHIPMENT") {
    const patched = await as(customer, () =>
      request(app).patch(`/api/fulfillments/${fulfillment_id}`).send({
        shipment: {
          shipper_address_id: addressId,
          package_id: packageId,
          carrier_service_id: labelServiceId,
          pickup_date: schedule ? "2026-09-15" : null,
          pickup_time: schedule ? "10:30:00" : null,
        },
      })
    );
    assert.equal(patched.status, 200, patched.text);
  }

  const payout = await as(customer, () =>
    request(app).post("/api/checkout/payout").send(payoutForm())
  );
  assert.equal(payout.status, 200, payout.text);
  assert.ok(payout.body.payment_details_id, "the row did not keep the details id");

  const cart = await as(customer, () =>
    request(app)
      .put("/api/checkout/items")
      .query({ direction: "purchase" })
      .send({ items: [{ bullion_id: productId, quantity: 2 }] })
  );
  assert.equal(cart.status, 200, cart.text);

  return {
    checkout_id: row.id,
    fulfillment_id,
    payment_details_id: payout.body.payment_details_id as string,
  };
}

test("the payout step SEALS the numbers and the plaintext columns stay NULL", async () => {
  await inPinnedTransaction(async (c: PoolClient) => {
    const fixtures = await aWorld(c);
    const { customer, dropoffMethodId } = fixtures;
    const { payment_details_id } = await primeCheckout(fixtures, dropoffMethodId);

    const { rows: [d] } = await c.query(
      `SELECT account_holder, last_four, routing_number, account_number,
              routing_number_encrypted, account_number_encrypted, encryption_key_id
         FROM payments.details WHERE id = $1`, [payment_details_id]
    );
    assert.equal(d.account_holder, PAYOUT.account_holder_name);
    assert.equal(d.last_four, "6789");
    assert.equal(d.routing_number, null, "a plaintext routing number was written");
    assert.equal(d.account_number, null, "a plaintext account number was written");
    assert.ok(d.routing_number_encrypted?.startsWith("v1."), "the routing number is not an envelope");
    assert.ok(d.account_number_encrypted?.startsWith("v1."), "the account number is not an envelope");
    assert.ok(
      !d.routing_number_encrypted.includes(PAYOUT.routing_number),
      "the envelope leaks the plaintext"
    );

    const key = payoutKeyFromEnv();
    assert.equal(
      open(d.routing_number_encrypted, key, aadFor(payment_details_id, "routing_number")),
      PAYOUT.routing_number,
      "the envelope does not open back to the number"
    );

    const again = await as(customer, () =>
      request(app).post("/api/checkout/payout").send(
        payoutForm(PAYOUT.routing_number, "000999999999")
      )
    );
    assert.equal(again.body.payment_details_id, payment_details_id, "an edit minted a second row");
    const { rows: [count] } = await c.query(
      `SELECT count(*)::int AS n FROM payments.details WHERE user_id = $1
        AND account_holder = $2`, [customer.id, PAYOUT.account_holder_name]
    );
    assert.equal(count.n, 1);
  }, { actor: TEST_ACTOR.id, lock: LOCKS.ORDERS });
});

test("an incomplete or nonsense payout form refuses", async () => {
  await inPinnedTransaction(async (c: PoolClient) => {
    const fixtures = await aWorld(c);
    const { customer } = fixtures;
    for (const [form, why] of [
      [{ direction: "purchase", method: "ACH", account_holder_name: "X" }, /routing number/],
      [payoutForm("12"), /9 digits/],
      [{ direction: "purchase", method: "ECHECK", account_holder_name: "X" }, /email/],
      [{ direction: "purchase", method: "NOT A METHOD", account_holder_name: "X" },
        /no such payout method/],
    ] as const) {
      const res = await as(customer, () =>
        request(app).post("/api/checkout/payout").send(form)
      );
      assert.equal(res.status, 422, `accepted: ${JSON.stringify(form)}`);
      assert.match(res.body?.error?.message ?? res.text, why);
    }
  }, { actor: TEST_ACTOR.id, lock: LOCKS.ORDERS });
});

test("the parcel is the draft's own row - no body exists any more", async () => {
  await inPinnedTransaction(async (c: PoolClient) => {
    const fixtures = await aWorld(c);
    const { dropoffMethodId } = fixtures;
    const { world, asked } = carrier();
    const { checkout_id } = await primeCheckout(fixtures, dropoffMethodId);
    const order = await place.place(checkout_id, world);

    const shell = await shellFor(c, order.order.id);
    assert.equal(shell.direction, "Inbound");
    assert.equal(shell.pickup_type, "Store Dropoff");
    assert.ok(shell.carrier_service_id, "the service the checkout chose was not copied");
    assert.ok(shell.package_id, "the box the checkout chose was not copied");
    assert.ok(Number(shell.declared_value) > 0, "the declared value is the server's");
    assert.equal(shell.tracking_number, null, "the shell committed with a label");

    assert.deepEqual(
      asked, [shell.id],
      "shipping was asked for a label against a different parcel"
    );
    assert.equal(shell.pickup_date, null, "a dropoff recorded a courier slot");
  }, { actor: TEST_ACTOR.id, lock: LOCKS.ORDERS });
});

test("a pickup needs its slot ON THE PARCEL, and carries it when set", async () => {
  await inPinnedTransaction(async (c: PoolClient) => {
    const fixtures = await aWorld(c);
    const { pickupMethodId } = fixtures;
    const unscheduled = await primeCheckout(fixtures, pickupMethodId);
    await assert.rejects(
      () => place.place(unscheduled.checkout_id, carrier().world),
      /missing pickup_date, pickup_time/
    );

    const { checkout_id } = await primeCheckout(fixtures, pickupMethodId, { schedule: true });
    const { world, asked } = carrier();
    const order = await place.place(checkout_id, world);

    const shell = await shellFor(c, order.order.id);
    assert.equal(shell.pickup_type, "Carrier Pickup");
    assert.equal(shell.pickup_date, "2026-09-15");
    assert.equal(shell.pickup_time, "10:30:00");
    assert.deepEqual(asked, [shell.id]);
  }, { actor: TEST_ACTOR.id, lock: LOCKS.ORDERS });
});

test("an incomplete checkout names the piece that is missing - the payout included", async () => {
  await inPinnedTransaction(async (c: PoolClient) => {
    const fixtures = await aWorld(c);
    const { dropoffMethodId } = fixtures;
    const { checkout_id } = await primeCheckout(fixtures, dropoffMethodId);
    await c.query(
      `UPDATE checkout.checkouts SET payment_details_id = NULL WHERE id = $1`, [checkout_id]
    );
    await assert.rejects(
      () => place.place(checkout_id, carrier().world), /missing payment_details_id/
    );
  }, { actor: TEST_ACTOR.id, lock: LOCKS.ORDERS });
});

test("a sale delivery service buys no labels, and a collected order owes its own steps", async () => {
  await inPinnedTransaction(async (c: PoolClient) => {
    const fixtures = await aWorld(c);
    const { customer, labelServiceId, saleServiceId, directMethodId, dropoffMethodId } = fixtures;
    const { checkout_id, fulfillment_id } = await primeCheckout(fixtures, dropoffMethodId);
    await as(customer, () =>
      request(app).patch(`/api/fulfillments/${fulfillment_id}`).send({
        shipment: { carrier_service_id: saleServiceId },
      })
    );
    await assert.rejects(
      () => place.place(checkout_id, carrier().world),
      /not a label service|sale delivery service/
    );

    await as(customer, () =>
      request(app).patch(`/api/fulfillments/${fulfillment_id}`).send({
        shipment: { carrier_service_id: labelServiceId },
      })
    );
    await as(customer, () =>
      request(app).post("/api/fulfillments").send({
        checkout_id, method_id: directMethodId,
      })
    );
    await assert.rejects(
      () => place.place(checkout_id, carrier().world),
      /missing start_time/
    );
  }, { actor: TEST_ACTOR.id, lock: LOCKS.ORDERS });
});

test("the placement links ids and writes NO exchange rows at all", async () => {
  await inPinnedTransaction(async (c: PoolClient) => {
    const fixtures = await aWorld(c);
    const { customer, labelServiceId, pickupMethodId } = fixtures;
    const { checkout_id, fulfillment_id, payment_details_id } =
      await primeCheckout(fixtures, pickupMethodId, { schedule: true });

    const { world, asked } = carrier();
    const placed = await place.place(checkout_id, world);
    const order_id = placed.order.id;

    const { rows: fulfillments } = await c.query(
      `SELECT f.id, m.type FROM fulfillments.fulfillments f
        JOIN fulfillments.methods m ON m.id = f.method_id
       WHERE f.order_id = $1`, [order_id]
    );
    assert.equal(fulfillments.length, 1);
    assert.equal(fulfillments[0].id, fulfillment_id);
    assert.equal(fulfillments[0].type, "CARRIER PICKUP");

    const { rows: [totals] } = await c.query(
      `SELECT shipping, shipping_service, payout_fee, payout_details_id
         FROM orders.transactions WHERE order_id = $1`, [order_id]
    );
    assert.equal(totals.shipping, null);
    assert.equal(totals.shipping_service, null);
    assert.equal(totals.payout_details_id, payment_details_id, "the account was not linked");
    assert.equal(Number(totals.payout_fee), 0, "ACH carries no flat fee");

    const { rows: [shipment] } = await c.query(
      `SELECT s.id, s.carrier_service_id, s.package_id FROM shipping.shipments s
        JOIN fulfillments.shipments fs ON fs.shipment_id = s.id
       WHERE fs.fulfillment_id = $1`, [fulfillment_id]
    );
    assert.equal(shipment.carrier_service_id, labelServiceId);
    assert.deepEqual(asked, [shipment.id]);

    const { rows: [exchange] } = await c.query(
      `SELECT
         (SELECT count(*)::int FROM exchange.purchase_orders WHERE id = $1) AS orders,
         (SELECT count(*)::int FROM exchange.payouts WHERE order_id = $1) AS payouts,
         (SELECT count(*)::int FROM exchange.shipments WHERE purchase_order_id = $1) AS shipments,
         (SELECT count(*)::int FROM exchange.carrier_pickups WHERE order_id = $1) AS pickups`,
      [order_id]
    );
    assert.deepEqual(
      exchange,
      { orders: 0, payouts: 0, shipments: 0, pickups: 0 },
      "a new-flow order wrote an exchange row"
    );

    const ach = await paymentMethodId(c, "ACH", "purchase");

    const wire = await as(
      { id: customer.id, role: "admin" },
      () => request(app).get(`/api/orders/${order_id}/payment-details`)
    );
    assert.equal(wire.status, 200, wire.text);
    assert.equal(wire.body.length, 1);
    assert.equal(wire.body[0].id, payment_details_id);
    assert.equal(wire.body[0].method_id, ach);
    assert.equal(wire.body[0].last_four, "6789");
    assert.equal(wire.body[0].routing_number, undefined, "the wire carried a full number");

    const details = await as(
      { id: customer.id, role: "admin" },
      () => request(app).get(`/api/payments/details/${payment_details_id}/bank`)
    );
    assert.equal(details.status, 200, details.text);
    assert.equal(details.body.routing_number, PAYOUT.routing_number);
    assert.equal(details.body.account_number, PAYOUT.account_number);
    assert.equal(details.body.order?.order_id, order_id);

    const fresh = await checkoutService.getRowFor(customer.id, "purchase", c);
    assert.equal(fresh.payment_details_id, null);
    assert.equal(fresh.fulfillment_id, null);
  }, { actor: TEST_ACTOR.id, lock: LOCKS.ORDERS });
});

test("a spent draft refuses the SECOND order", async () => {
  await inPinnedTransaction(async (c: PoolClient) => {
    const fixtures = await aWorld(c);
    const { dropoffMethodId } = fixtures;
    const first = await primeCheckout(fixtures, dropoffMethodId);
    await place.place(first.checkout_id, carrier().world);

    const second = await primeCheckout(fixtures, dropoffMethodId);
    await c.query(
      `UPDATE checkout.checkouts SET fulfillment_id = $2 WHERE id = $1`,
      [second.checkout_id, first.fulfillment_id]
    );
    await assert.rejects(
      () => place.place(second.checkout_id, carrier().world),
      /already belongs to an order/
    );
  }, { actor: TEST_ACTOR.id, lock: LOCKS.ORDERS });
});

test("a carrier failure buying the label leaves the order and its shell shipment behind", async () => {
  await inPinnedTransaction(async (c: PoolClient) => {
    const fixtures = await aWorld(c);
    const { dropoffMethodId } = fixtures;
    const { checkout_id, fulfillment_id } = await primeCheckout(fixtures, dropoffMethodId);

    const failing: typeof place.LIVE = {
      buyLabel: async () => {
        throw new Error("FEDEX IS DOWN");
      },
      authorize: async () => {},
      confirm: async () => {},
    };

    await assert.rejects(() => place.place(checkout_id, failing), /FEDEX IS DOWN/);

    const { rows: [fulfillment] } = await c.query(
      `SELECT order_id FROM fulfillments.fulfillments WHERE id = $1`, [fulfillment_id]
    );
    assert.ok(fulfillment?.order_id, "the order did not commit before the carrier was asked");

    const { rows: [order] } = await c.query(
      `SELECT status FROM orders.orders WHERE id = $1`, [fulfillment.order_id]
    );
    assert.equal(order.status, "In Transit", "the order row itself did not survive");

    const { rows: [shipment] } = await c.query(
      `SELECT s.tracking_number, s.label, s.shipping_status FROM shipping.shipments s
        JOIN fulfillments.shipments fs ON fs.shipment_id = s.id
       WHERE fs.fulfillment_id = $1`,
      [fulfillment_id]
    );
    assert.ok(shipment, "the shell shipment was never committed");
    assert.equal(shipment.tracking_number, null, "a failed carrier call still recorded a tracking number");
    assert.equal(shipment.label, null, "a failed carrier call still recorded a label");

    const { rows: [totals] } = await c.query(
      `SELECT shipping FROM orders.transactions WHERE order_id = $1`, [fulfillment.order_id]
    );
    assert.equal(totals.shipping, null, "a failed carrier call still recorded a shipping charge");
  }, { actor: TEST_ACTOR.id, lock: LOCKS.ORDERS });
});
