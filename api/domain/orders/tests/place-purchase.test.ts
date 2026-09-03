// THE ZERO-BODY PURCHASE CREATE (D210), tested to the hilt without a FedEx
// call ever being reachable. By Confirm, everything is a server-side
// resource: the row's ids, the parcel facts as columns, the draft
// fulfillment, and the payout account SEALED in payments.details at the
// payout step. The resolution reads only the row; the record half links ids
// and writes NO exchange rows at all.
import test, { after, before } from "node:test";
import assert from "node:assert/strict";
import type { PoolClient } from "pg";
import request from "supertest";
import pool from "#db";
import { mockSessions, restoreSessions, as } from "#shared/testing/session.ts";
import { inPinnedTransaction, outside } from "#shared/testing/pinned-pool.ts";
import { LOCKS } from "#shared/testing/locks.ts";
import { open, aadFor } from "#shared/crypto/envelope.ts";
import { payoutKeyFromEnv } from "#shared/crypto/payoutKey.ts";

await mockSessions();
const { default: app } = await import("#app");
const orderCreate = await import("#domain/orders/place.ts");
const checkoutService = await import("#domain/checkout/service.ts");

type UserFixture = { id: string };

let customer: UserFixture;
let addressId: string;
let customerName: string | null;
let packageId: string;
let labelServiceId: string;   // 'Express Saver' - a real carrier row the catalogue offers
let saleServiceId: string;    // a carrier-agnostic sale row (110) - must be refused
let dropoffMethodId: string;  // CARRIER DROPOFF
let pickupMethodId: string;   // CARRIER PICKUP
let directMethodId: string;   // a non-SHIPMENT purchase method
let productName: string;

// A BUILDER, not a base object to spread over: the two fields a variant changes
// are arguments, so no call site copies the other five.
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

before(async () => {
  // WHO SIGNS FOR THE PARCEL IS THE CUSTOMER'S NAME (D214 item 12). It used to
  // be the address BOOK's label ("Home"), read from exchange.addresses' `name`
  // through the composer; places.addresses has no such column, and the person
  // is the same person either way.
  const users = await outside<{ id: string; address_id: string; name: string | null }>(
    `SELECT u.id, ua.address_id, a.name
       FROM exchange.users u
       JOIN places.user_addresses ua ON ua.user_id = u.id
       JOIN auth.users a ON a.id = u.id
      WHERE u.role IS DISTINCT FROM 'admin'
      ORDER BY u.email LIMIT 1`
  );
  assert.ok(users.length, "dev needs a non-admin user with an address");
  customer = { id: users[0].id };
  addressId = users[0].address_id;
  customerName = users[0].name;

  packageId = (
    await outside<{ id: string }>(
      `SELECT id FROM shipping.packages WHERE carrier_id IS NULL AND label = 'Small Box' LIMIT 1`
    )
  )[0].id;
  labelServiceId = (
    await outside<{ id: string }>(
      `SELECT id FROM shipping.services WHERE name = 'Express Saver' AND carrier_id IS NOT NULL LIMIT 1`
    )
  )[0].id;
  saleServiceId = (
    await outside<{ id: string }>(
      `SELECT id FROM shipping.services WHERE carrier_id IS NULL AND price IS NOT NULL LIMIT 1`
    )
  )[0].id;

  const methods = await outside<{ id: string; type: string; category: string }>(
    `SELECT id, type, category FROM fulfillments.methods
      WHERE direction = 'purchase' AND enabled AND NOT hidden`
  );
  dropoffMethodId = methods.find((m) => m.type === "CARRIER DROPOFF")!.id;
  pickupMethodId = methods.find((m) => m.type === "CARRIER PICKUP")!.id;
  directMethodId = methods.find((m) => m.category !== "SHIPMENT")!.id;

  productName = (
    await outside<{ product_name: string }>(
      `SELECT product_name FROM exchange.products WHERE sell_display = true LIMIT 1`
    )
  )[0].product_name;
});

after(async () => {
  await restoreSessions();
  await pool.end();
});

// Drive the same surfaces the stepper drives: PATCH the row (ids AND parcel
// facts), POST the fulfillment, POST the payout, sync the sell cart.
async function primeCheckout(
  methodId: string,
  { schedule = false }: { schedule?: boolean } = {}
) {
  const patched = await as(customer, () =>
    request(app).patch("/api/checkout").send({
      direction: "purchase",
      shipper_address_id: addressId,
      package_id: packageId,
      carrier_service_id: labelServiceId,
      package_weight: 3,
      declared_value: 2500,
      pickup_date: schedule ? "2026-09-15" : null,
      pickup_time: schedule ? "10:30:00" : null,
    })
  );
  assert.equal(patched.status, 200, patched.text);

  const ff = await as(customer, () =>
    request(app).post("/api/checkout/fulfillment").send({
      direction: "purchase",
      method_id: methodId,
    })
  );
  assert.equal(ff.status, 200, ff.text);

  const payout = await as(customer, () =>
    request(app).post("/api/checkout/payout").send(payoutForm())
  );
  assert.equal(payout.status, 200, payout.text);
  assert.ok(payout.body.payment_details_id, "the row did not keep the details id");

  const cart = await as(customer, () =>
    request(app).post("/api/cart/sync_sell_cart").send({
      cart: [{ type: "product", data: { name: productName, quantity: 2 } }],
    })
  );
  assert.equal(cart.status, 200, cart.text);
  return {
    fulfillment_id: ff.body.fulfillment_id as string,
    payment_details_id: payout.body.payment_details_id as string,
  };
}

// ------------------------------------------------------- the payout step

test("the payout step SEALS the numbers and the plaintext columns stay NULL", async () => {
  await inPinnedTransaction(async (c: PoolClient) => {
    const { payment_details_id } = await primeCheckout(dropoffMethodId);

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

    // Editing rewrites IN PLACE - the checkout keeps one details row.
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
  }, { lock: LOCKS.ORDERS });
});

test("an incomplete or nonsense payout form refuses", async () => {
  await inPinnedTransaction(async () => {
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
      // 422, NOT 400 (D214 item 11): the payout form's rules are the domain's,
      // and a domain refusal is Invalid.
      assert.equal(res.status, 422, `accepted: ${JSON.stringify(form)}`);
      assert.match(res.body?.error?.message ?? res.text, why);
    }
  }, { lock: LOCKS.ORDERS });
});

// ------------------------------------------------------- the resolution

// THE PLAN IS THE CHECKOUT ROW, RESOLVED. `resolvePurchase` takes the row
// itself now rather than a user id - `place(checkout_id)` is the whole input,
// and the customer is the row's own user_id.
const planFor = async () =>
  await orderCreate.resolvePurchase(
    await checkoutService.getRowFor(customer.id, "purchase")
  );

test("the resolution reads ONLY the row - no body exists any more", async () => {
  await inPinnedTransaction(async () => {
    const { fulfillment_id, payment_details_id } = await primeCheckout(dropoffMethodId);

    const planned = await planFor();

    assert.equal(planned.checkout.shipper_address_id, addressId);
    assert.equal(planned.shipper.id, addressId, "the address row itself is carried");
    assert.equal(planned.customerName, customerName);
    assert.equal(planned.parcel.serviceType, "FEDEX_EXPRESS_SAVER");
    assert.equal(planned.checkout.carrier_service_id, labelServiceId);
    assert.equal(planned.parcel.handoff.code, "DROPOFF_AT_FEDEX_LOCATION");
    assert.equal(planned.checkout.package_id, packageId);
    assert.equal(planned.parcel.weight.value, 3, "the weight came off the ROW");
    assert.equal(planned.parcel.declaredValue, 2500, "the declared value came off the ROW");
    assert.equal(planned.checkout.payment_details_id, payment_details_id);
    assert.equal(planned.payoutFee, 0, "ACH carries no flat fee");
    assert.equal(planned.checkout.fulfillment_id, fulfillment_id);
  }, { lock: LOCKS.ORDERS });
});

test("a pickup needs its slot ON THE ROW, and carries it when set", async () => {
  await inPinnedTransaction(async () => {
    await primeCheckout(pickupMethodId);
    await assert.rejects(() => planFor(), /date and a time/);

    await primeCheckout(pickupMethodId, { schedule: true });
    const planned = await planFor();
    assert.equal(planned.parcel.handoff.name, "Carrier Pickup");
    assert.equal(planned.parcel.schedule?.date, "2026-09-15");
    assert.equal(planned.parcel.schedule?.time, "10:30:00");
  }, { lock: LOCKS.ORDERS });
});

test("an incomplete checkout names every missing piece - the payout included", async () => {
  await inPinnedTransaction(async () => {
    await assert.rejects(() => planFor(), /missing .*payment_details_id/);
  }, { lock: LOCKS.ORDERS });
});

test("a sale delivery service buys no labels, and a non-SHIPMENT method refuses", async () => {
  await inPinnedTransaction(async () => {
    await primeCheckout(dropoffMethodId);
    await as(customer, () =>
      request(app).patch("/api/checkout").send({
        direction: "purchase", carrier_service_id: saleServiceId,
      })
    );
    await assert.rejects(() => planFor(), /not a label service|sale delivery service/);

    await as(customer, () =>
      request(app).patch("/api/checkout").send({
        direction: "purchase", carrier_service_id: labelServiceId,
      })
    );
    await as(customer, () =>
      request(app).post("/api/checkout/fulfillment").send({
        direction: "purchase", method_id: directMethodId,
      })
    );
    await assert.rejects(() => planFor(), /cannot be placed through the shipping checkout/);
  }, { lock: LOCKS.ORDERS });
});

// ------------------------------------------------------- the record half

test("the record half links ids and writes NO exchange rows at all", async () => {
  await inPinnedTransaction(async (c: PoolClient) => {
    const { fulfillment_id, payment_details_id } =
      await primeCheckout(pickupMethodId, { schedule: true });
    const planned = await orderCreate.resolvePurchase(
      await checkoutService.getRowFor(customer.id, "purchase", c)
    );

    const placed = await orderCreate.recordPurchase(c, {
      planned, netCharge: 24.5,
      pickup: { confirmationNumber: "9971234", location: "FRONT" },
    });

    // The order core, with the DRAFT as its one fulfillment.
    const { rows: fulfillments } = await c.query(
      `SELECT f.id, m.type FROM fulfillments.fulfillments f
        JOIN fulfillments.methods m ON m.id = f.method_id
       WHERE f.order_id = $1`, [placed.order_id]
    );
    assert.equal(fulfillments.length, 1);
    assert.equal(fulfillments[0].id, fulfillment_id);
    assert.equal(fulfillments[0].type, "CARRIER PICKUP");

    // The money row LINKS the sealed account and records the method's fee.
    const { rows: [totals] } = await c.query(
      `SELECT shipping, shipping_service, payout_fee, payout_details_id
         FROM orders.transactions WHERE order_id = $1`, [placed.order_id]
    );
    assert.equal(Number(totals.shipping), 24.5);
    assert.equal(totals.payout_details_id, payment_details_id, "the account was not linked");
    assert.equal(Number(totals.payout_fee), 0);

    // The parcel and its NATIVE booking.
    const { rows: [shipment] } = await c.query(
      `SELECT s.id, s.carrier_service_id, s.package_id FROM shipping.shipments s
        JOIN fulfillments.shipments fs ON fs.shipment_id = s.id
       WHERE fs.fulfillment_id = $1`, [fulfillment_id]
    );
    assert.equal(shipment.carrier_service_id, labelServiceId);
    const { rows: [booking] } = await c.query(
      `SELECT status, confirmation_number, requested_at FROM shipping.pickups
        WHERE shipment_id = $1`, [shipment.id]
    );
    assert.equal(booking?.status, "scheduled");
    assert.equal(booking?.confirmation_number, "9971234");

    // *** ZERO EXCHANGE ROWS - the write pivot for this path, executed. ***
    const { rows: [exchange] } = await c.query(
      `SELECT
         (SELECT count(*)::int FROM exchange.purchase_orders WHERE id = $1) AS orders,
         (SELECT count(*)::int FROM exchange.payouts WHERE order_id = $1) AS payouts,
         (SELECT count(*)::int FROM exchange.shipments WHERE purchase_order_id = $1) AS shipments,
         (SELECT count(*)::int FROM exchange.carrier_pickups WHERE order_id = $1) AS pickups`,
      [placed.order_id]
    );
    assert.deepEqual(
      exchange,
      { orders: 0, payouts: 0, shipments: 0, pickups: 0 },
      "a new-flow order wrote an exchange row"
    );

    // The admin surfaces still work: the order-keyed payout read composes
    // from the new tables, and the details endpoint OPENS the envelopes.
    const wire = await as(
      { id: customer.id, role: "admin" },
      () => request(app).get(`/api/orders/${placed.order_id}/payouts`)
    );
    assert.equal(wire.status, 200, wire.text);
    assert.equal(wire.body.length, 1);
    assert.equal(wire.body[0].id, payment_details_id);
    assert.equal(wire.body[0].method, "ACH");
    assert.equal(wire.body[0].account_last4, "6789");
    assert.equal(wire.body[0].routing_number, undefined, "the wire carried a full number");

    const details = await as(
      { id: customer.id, role: "admin" },
      () => request(app).get(`/api/payouts/${payment_details_id}/details`)
    );
    assert.equal(details.status, 200, details.text);
    assert.equal(details.body.routing_number, PAYOUT.routing_number);
    assert.equal(details.body.account_number, PAYOUT.account_number);
    assert.equal(details.body.order_id, placed.order_id);

    // The row starts the next checkout clean - the payout pointers included.
    await checkoutService.resetAfterOrder(customer.id, "purchase", c);
    const fresh = await checkoutService.getRowFor(customer.id, "purchase", c);
    assert.equal(fresh.payment_details_id, null);
    assert.equal(fresh.fulfillment_id, null);
    assert.equal(fresh.package_weight, null);
  }, { lock: LOCKS.ORDERS });
});

test("a spent draft refuses the SECOND order", async () => {
  await inPinnedTransaction(async (c: PoolClient) => {
    const primed = await primeCheckout(dropoffMethodId);
    const first = await orderCreate.resolvePurchase(
      await checkoutService.getRowFor(customer.id, "purchase", c)
    );
    await orderCreate.recordPurchase(c, { planned: first, netCharge: 24.5 });
    await c.query(
      `UPDATE checkout.checkouts SET
         fulfillment_id = $2, shipper_address_id = $3, package_id = $4,
         carrier_service_id = $5, payment_details_id = $6,
         package_weight = 3
       WHERE user_id = $1 AND direction = 'purchase'`,
      [customer.id, primed.fulfillment_id, addressId, packageId, labelServiceId,
       primed.payment_details_id]
    );
    await assert.rejects(
      async () =>
        orderCreate.resolvePurchase(
          await checkoutService.getRowFor(customer.id, "purchase", c)
        ),
      /already belongs to an order/
    );
  }, { lock: LOCKS.ORDERS });
});
