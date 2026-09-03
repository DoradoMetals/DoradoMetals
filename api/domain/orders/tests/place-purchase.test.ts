// THE ZERO-BODY PURCHASE CREATE (D210), tested to the hilt without a FedEx
// call ever being reachable. By Confirm, everything is a server-side resource:
// the row's ids, the parcel's weight and declared value COMPUTED (ruling 58,
// not columns any more), the draft fulfillment, and the payout account
// SEALED in payments.details at the payout step.
//
// THE SEAMS ARE GONE (D214 item 11). `resolvePurchase` and `recordPurchase`
// were exported halves of one use case, so the row flow could be asserted with
// no provider reachable. `place(checkout_id, world)` takes the outside world as
// an argument instead - the seam sendToRefiner already had for email - and the
// stub RECORDS what the carrier was asked for, which is what the resolution
// used to be asserted on.
import { test, afterAll } from "vitest";
import assert from "node:assert/strict";
import type { PoolClient } from "pg";
import request from "supertest";
import pool from "#db";
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
import type * as placeModule from "#domain/orders/place.ts";

await mockSessions();
const { default: app } = await import("#app");
const place = await import("#domain/orders/place.ts");
const checkoutService = await import("#domain/checkout/service.ts");

type UserFixture = { id: string };

// THE WHOLE WORLD IS BUILT (lane 1), and it is threaded through primeCheckout
// rather than held in module-scope `let`s.
//
// What it replaces: a non-admin customer WITH AN ADDRESS, found by joining the
// FROZEN `exchange.users` to `places.user_addresses` and back to `auth.users`
// for the name (three tables to answer "a person and where they live"), plus a
// product name out of `exchange.products` - a table D212 stopped writing.
// The basket names the product by id now.
//
// The seeded reference rows stay named: "Small Box", "Express Saver", a
// carrier-agnostic sale service, and the three purchase fulfillment methods.
// Those are literals of the seed, not fixtures - see
// shared/testing/builders/reference.ts.
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
    // A non-SHIPMENT purchase method - the shipping checkout must refuse it.
    directMethodId: await fulfillmentMethodId(c, "PICKUP", "purchase"),
    productId: product.id,
  };
};


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

// `World` here is domain/orders/place.ts's - the outside world the placement
// is handed. Not to be confused with this file's own fixture `World` above;
// the import is aliased, so both names stay readable.
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

afterAll(async () => {
  await restoreSessions();
  await pool.end();
});

// Drive the same surfaces the stepper drives: PATCH the row (ids AND parcel
// facts), POST the fulfillment, POST the payout, PUT the basket.
async function primeCheckout(
  fixtures: Fixtures,
  methodId: string,
  { schedule = false }: { schedule?: boolean } = {}
) {
  const { customer, addressId, packageId, labelServiceId, productId } = fixtures;
  const patched = await as(customer, () =>
    request(app).patch("/api/checkout").send({
      direction: "purchase",
      shipper_address_id: addressId,
      package_id: packageId,
      carrier_service_id: labelServiceId,
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
    request(app)
      .put("/api/checkout/items")
      .query({ direction: "purchase" })
      .send({ items: [{ bullion_id: productId, quantity: 2 }] })
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
      // 422, NOT 400 (D214 item 11): the payout form's rules are the domain's,
      // and a domain refusal is Invalid.
      assert.equal(res.status, 422, `accepted: ${JSON.stringify(form)}`);
      assert.match(res.body?.error?.message ?? res.text, why);
    }
  }, { actor: TEST_ACTOR.id, lock: LOCKS.ORDERS });
});

// ------------------------------------------------------- what the carrier is asked

test("the carrier is asked ONLY what the row holds - no body exists any more", async () => {
  await inPinnedTransaction(async (c: PoolClient) => {
    const fixtures = await aWorld(c);
    const { customerName, addressId, dropoffMethodId } = fixtures;
    const { world, asked } = carrier();
    const { checkout_id } = await primeCheckout(fixtures, dropoffMethodId);
    await place.place(checkout_id, world);

    assert.equal(asked.length, 1, "the carrier was asked once, for one parcel");
    const { shipper, personName, parcel } = asked[0];
    assert.equal(shipper.id, addressId, "the address row itself is carried");
    assert.equal(personName, customerName);
    assert.equal(parcel.serviceType, "FEDEX_EXPRESS_SAVER");
    assert.equal(parcel.handoff.code, "DROPOFF_AT_FEDEX_LOCATION");
    // Two troy ounces of coin weighs far less than a pound - the box's own
    // minimum (Small Box, 2 lb) is what actually governs (ruling 58).
    assert.equal(parcel.weight.value, 2, "the weight is computed, not read off the row");
    assert.ok(parcel.declaredValue > 0, "the declared value is computed, not read off the row");
    assert.equal(parcel.schedule, null, "a dropoff booked a courier");
  }, { actor: TEST_ACTOR.id, lock: LOCKS.ORDERS });
});

test("a pickup needs its slot ON THE ROW, and carries it when set", async () => {
  await inPinnedTransaction(async (c: PoolClient) => {
    const fixtures = await aWorld(c);
    const { pickupMethodId } = fixtures;
    const unscheduled = await primeCheckout(fixtures, pickupMethodId);
    await assert.rejects(
      () => place.place(unscheduled.checkout_id, carrier().world), /date and a time/
    );

    const { checkout_id } = await primeCheckout(fixtures, pickupMethodId, { schedule: true });
    const { world, asked } = carrier({
      pickup: { confirmationNumber: "9971234", location: "FRONT" },
    });
    await place.place(checkout_id, world);
    assert.equal(asked[0].parcel.handoff.name, "Carrier Pickup");
    assert.equal(asked[0].parcel.schedule?.date, "2026-09-15");
    assert.equal(asked[0].parcel.schedule?.time, "10:30:00");
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

test("a sale delivery service buys no labels, and a non-SHIPMENT method refuses", async () => {
  await inPinnedTransaction(async (c: PoolClient) => {
    const fixtures = await aWorld(c);
    const { customer, labelServiceId, saleServiceId, directMethodId, dropoffMethodId } = fixtures;
    const { checkout_id } = await primeCheckout(fixtures, dropoffMethodId);
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
  }, { actor: TEST_ACTOR.id, lock: LOCKS.ORDERS });
});

// ------------------------------------------------------- the rows it writes

test("the placement links ids and writes NO exchange rows at all", async () => {
  await inPinnedTransaction(async (c: PoolClient) => {
    const fixtures = await aWorld(c);
    const { customer, labelServiceId, pickupMethodId } = fixtures;
    const { checkout_id, fulfillment_id, payment_details_id } =
      await primeCheckout(fixtures, pickupMethodId, { schedule: true });

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
    // KEPT (exchange-fixtures lane, D214 item 10): this reads exchange to
    // prove its ABSENCE for the order this test itself just placed, not as a
    // fixture source - a builder-made row could not prove a negative about
    // the write path the way asserting on the live app's own output does.
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

// ------------------------------------------------- label-after-commit (2026-09-03)

// THE ORACLE FOR THE FINDING THIS FILE'S SIBLING WAVE FIXED: a carrier failure
// used to leave a voided-but-billed label and a rolled-back order. Now the
// order and its shell shipment commit BEFORE the carrier is ever asked, so a
// failure here must leave them standing rather than undoing them.
test("a carrier failure buying the label leaves the order and its shell shipment behind", async () => {
  await inPinnedTransaction(async (c: PoolClient) => {
    const fixtures = await aWorld(c);
    const { dropoffMethodId } = fixtures;
    const { checkout_id, fulfillment_id } = await primeCheckout(fixtures, dropoffMethodId);

    const failing: placeModule.World = {
      buyPostage: async () => {
        throw new Error("FEDEX IS DOWN");
      },
      authorize: async () => {},
      confirm: async () => {},
    };

    await assert.rejects(() => place.place(checkout_id, failing), /FEDEX IS DOWN/);

    // The rejected promise never handed back an order id, so it is found the
    // way the DATABASE links it - through the fulfillment id the checkout
    // already named.
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
