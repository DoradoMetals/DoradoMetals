// THE ZERO-BODY PURCHASE CREATE (D210), tested to the hilt without a FedEx
// call ever being reachable. By Confirm, everything is a server-side resource:
// the row's ids, the parcel facts as columns, the draft fulfillment, and the
// payout account SEALED in payments.details at the payout step.
//
// THE SEAMS ARE GONE (D214 item 11). `resolvePurchase` and `recordPurchase`
// were exported halves of one use case, so the row flow could be asserted with
// no provider reachable. `place(checkout_id, world)` takes the outside world as
// an argument instead - the seam sendToRefiner already had for email - and the
// stub RECORDS what the carrier was asked for, which is what the resolution
// used to be asserted on.
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
import type * as placeModule from "#domain/orders/place.ts";

await mockSessions();
const { default: app } = await import("#app");
const place = await import("#domain/orders/place.ts");
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

// THE PROVIDER BOUNDARY, STUBBED AND RECORDED. no-network.ts refuses a real
// carrier call loudly, so this says what FedEx answered - and keeps what it was
// asked, which is the resolution these tests used to read off a plan object.
type Asked = {
  shipper: Parameters<placeModule.World["buyPostage"]>[0];
  personName: string;
  parcel: Parameters<placeModule.World["buyPostage"]>[2];
};

function carrier(
  { pickup = null as { confirmationNumber: string | null; location: string | null } | null } = {}
) {
  const asked: Asked[] = [];
  const world: placeModule.World = {
    buyPostage: async (shipper, personName, parcel) => {
      asked.push({ shipper, personName, parcel });
      return { netCharge: 24.5, tracking_number: "794123456789", label: null, pickup };
    },
    authorize: async () => {},
    confirm: async () => {},
  };
  return { world, asked };
}

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

  const row = await checkoutService.getRowFor(customer.id, "purchase");
  return {
    checkout_id: row.id,
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

// ------------------------------------------------------- what the carrier is asked

test("the carrier is asked ONLY what the row holds - no body exists any more", async () => {
  await inPinnedTransaction(async () => {
    const { world, asked } = carrier();
    const { checkout_id } = await primeCheckout(dropoffMethodId);
    await place.place(checkout_id, world);

    assert.equal(asked.length, 1, "the carrier was asked once, for one parcel");
    const { shipper, personName, parcel } = asked[0];
    assert.equal(shipper.id, addressId, "the address row itself is carried");
    assert.equal(personName, customerName);
    assert.equal(parcel.serviceType, "FEDEX_EXPRESS_SAVER");
    assert.equal(parcel.handoff.code, "DROPOFF_AT_FEDEX_LOCATION");
    assert.equal(parcel.weight.value, 3, "the weight came off the ROW");
    assert.equal(parcel.declaredValue, 2500, "the declared value came off the ROW");
    assert.equal(parcel.schedule, null, "a dropoff booked a courier");
  }, { lock: LOCKS.ORDERS });
});

test("a pickup needs its slot ON THE ROW, and carries it when set", async () => {
  await inPinnedTransaction(async () => {
    const unscheduled = await primeCheckout(pickupMethodId);
    await assert.rejects(
      () => place.place(unscheduled.checkout_id, carrier().world), /date and a time/
    );

    const { checkout_id } = await primeCheckout(pickupMethodId, { schedule: true });
    const { world, asked } = carrier({
      pickup: { confirmationNumber: "9971234", location: "FRONT" },
    });
    await place.place(checkout_id, world);
    assert.equal(asked[0].parcel.handoff.name, "Carrier Pickup");
    assert.equal(asked[0].parcel.schedule?.date, "2026-09-15");
    assert.equal(asked[0].parcel.schedule?.time, "10:30:00");
  }, { lock: LOCKS.ORDERS });
});

test("an incomplete checkout names the piece that is missing - the payout included", async () => {
  await inPinnedTransaction(async (c: PoolClient) => {
    const { checkout_id } = await primeCheckout(dropoffMethodId);
    await c.query(
      `UPDATE checkout.checkouts SET payment_details_id = NULL WHERE id = $1`, [checkout_id]
    );
    await assert.rejects(
      () => place.place(checkout_id, carrier().world), /missing payment_details_id/
    );
  }, { lock: LOCKS.ORDERS });
});

test("a sale delivery service buys no labels, and a non-SHIPMENT method refuses", async () => {
  await inPinnedTransaction(async () => {
    const { checkout_id } = await primeCheckout(dropoffMethodId);
    await as(customer, () =>
      request(app).patch("/api/checkout").send({
        direction: "purchase", carrier_service_id: saleServiceId,
      })
    );
    await assert.rejects(
      () => place.place(checkout_id, carrier().world),
      /not a label service|sale delivery service/
    );

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
    await assert.rejects(
      () => place.place(checkout_id, carrier().world),
      /cannot be placed through the shipping checkout/
    );
  }, { lock: LOCKS.ORDERS });
});

// ------------------------------------------------------- the rows it writes

test("the placement links ids and writes NO exchange rows at all", async () => {
  await inPinnedTransaction(async (c: PoolClient) => {
    const { checkout_id, fulfillment_id, payment_details_id } =
      await primeCheckout(pickupMethodId, { schedule: true });

    const placed = await place.place(
      checkout_id,
      carrier({ pickup: { confirmationNumber: "9971234", location: "FRONT" } }).world
    );
    const order_id = placed.order.id;

    // The order core, with the DRAFT as its one fulfillment.
    const { rows: fulfillments } = await c.query(
      `SELECT f.id, m.type FROM fulfillments.fulfillments f
        JOIN fulfillments.methods m ON m.id = f.method_id
       WHERE f.order_id = $1`, [order_id]
    );
    assert.equal(fulfillments.length, 1);
    assert.equal(fulfillments[0].id, fulfillment_id);
    assert.equal(fulfillments[0].type, "CARRIER PICKUP");

    // The money row LINKS the sealed account and records the method's fee.
    const { rows: [totals] } = await c.query(
      `SELECT shipping, shipping_service, payout_fee, payout_details_id
         FROM orders.transactions WHERE order_id = $1`, [order_id]
    );
    assert.equal(Number(totals.shipping), 24.5);
    assert.equal(totals.payout_details_id, payment_details_id, "the account was not linked");
    assert.equal(Number(totals.payout_fee), 0, "ACH carries no flat fee");

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
      [order_id]
    );
    assert.deepEqual(
      exchange,
      { orders: 0, payouts: 0, shipments: 0, pickups: 0 },
      "a new-flow order wrote an exchange row"
    );

    // The admin surfaces still work: the order-keyed payout read composes from
    // the new tables, and the details endpoint OPENS the envelopes.
    const wire = await as(
      { id: customer.id, role: "admin" },
      () => request(app).get(`/api/orders/${order_id}/payouts`)
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
    assert.equal(details.body.order_id, order_id);

    // THE CHECKOUT IS CONSUMED: its ids belong to the order now.
    const fresh = await checkoutService.getRowFor(customer.id, "purchase", c);
    assert.equal(fresh.payment_details_id, null);
    assert.equal(fresh.fulfillment_id, null);
    assert.equal(fresh.package_weight, null);
  }, { lock: LOCKS.ORDERS });
});

test("a spent draft refuses the SECOND order", async () => {
  await inPinnedTransaction(async (c: PoolClient) => {
    const first = await primeCheckout(dropoffMethodId);
    await place.place(first.checkout_id, carrier().world);

    const second = await primeCheckout(dropoffMethodId);
    await c.query(
      `UPDATE checkout.checkouts SET fulfillment_id = $2 WHERE id = $1`,
      [second.checkout_id, first.fulfillment_id]
    );
    await assert.rejects(
      () => place.place(second.checkout_id, carrier().world),
      /already belongs to an order/
    );
  }, { lock: LOCKS.ORDERS });
});
