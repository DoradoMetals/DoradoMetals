// THE ROW-FLOW PURCHASE CREATE (D208), tested to the hilt without a FedEx
// call ever being reachable: the RESOLUTION (checkout row + draft + slim body
// -> what the label call and the record need) is DB-only and tested directly;
// the record half (recordPlacedPurchase: order core, bank-details anchor,
// money row, shipment, booking, reset) is tested rows-only. The label
// purchase itself is exercised by the FedEx sandbox lane - what is new here
// is everything around it.
import test, { after, before } from "node:test";
import assert from "node:assert/strict";
import type { PoolClient } from "pg";
import request from "supertest";
import pool from "#db";
import { mockSessions, restoreSessions, as } from "#shared/testing/session.ts";
import { inPinnedTransaction, outside } from "#shared/testing/pinned-pool.ts";

await mockSessions();
const { default: app } = await import("#app");
const orderCreate = await import("#features/orders/create.ts");
const checkoutRows = await import("#features/checkout/repo.next.ts");

type UserFixture = { id: string };

let customer: UserFixture;
let addressId: string;
let recipientLabel: string | null;
let packageId: string;
let labelServiceId: string;   // 'Express Saver' - a real carrier row the catalogue offers
let saleServiceId: string;    // a carrier-agnostic sale row (110) - must be refused
let dropoffMethodId: string;  // CARRIER DROPOFF
let pickupMethodId: string;   // CARRIER PICKUP
let directMethodId: string;   // a non-SHIPMENT purchase method
let productId: string;
let productName: string;

const PAYOUT = { method: "ACH", account_holder_name: "Row Flow Test" };
const BODY = {
  payout: PAYOUT,
  package_weight: { units: "LB", value: 3 },
  declared_value: 2500,
};

before(async () => {
  const users = await outside<{ id: string; address_id: string; label: string | null }>(
    `SELECT u.id, ua.address_id, ua.label
       FROM exchange.users u
       JOIN places.user_addresses ua ON ua.user_id = u.id
      WHERE u.role IS DISTINCT FROM 'admin'
        AND EXISTS (SELECT 1 FROM auth.users a WHERE a.id = u.id)
      ORDER BY u.email LIMIT 1`
  );
  assert.ok(users.length, "dev needs a non-admin user with an address");
  customer = { id: users[0].id };
  addressId = users[0].address_id;
  recipientLabel = users[0].label;

  packageId = (
    await outside<{ id: string }>(`SELECT id FROM shipping.packages WHERE label IS NOT NULL LIMIT 1`)
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
  assert.ok(dropoffMethodId && pickupMethodId && directMethodId, "the methods seed is missing rows");

  const product = (
    await outside<{ id: string; product_name: string }>(
      `SELECT id, product_name FROM exchange.products WHERE sell_display = true LIMIT 1`
    )
  )[0];
  productId = product.id;
  productName = product.product_name;
});

after(async () => {
  await restoreSessions();
  await pool.end();
});

// Drive the same surfaces the stepper will drive: PATCH the row, POST the
// fulfillment, sync the sell cart.
async function primeCheckout(methodId: string) {
  const patched = await as(customer, () =>
    request(app).patch("/api/checkout").send({
      direction: "purchase",
      shipper_address_id: addressId,
      package_id: packageId,
      carrier_service_id: labelServiceId,
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

  const cart = await as(customer, () =>
    request(app).post("/api/cart/sync_sell_cart").send({
      cart: [{ type: "product", data: { name: productName, quantity: 2 } }],
    })
  );
  assert.equal(cart.status, 200, cart.text);
  return ff.body.fulfillment_id as string;
}

test("the resolution carries exactly what the label call and the record need - dropoff", async () => {
  await inPinnedTransaction(async () => {
    const draftId = await primeCheckout(dropoffMethodId);

    const resolved = await orderCreate.resolvePurchaseCheckout(customer.id, BODY);

    assert.equal(resolved.row.shipper_address_id, addressId);
    assert.equal(resolved.recipientName, recipientLabel);
    assert.ok(resolved.address.line_1, "the postal fields came along");

    assert.equal(resolved.service.serviceType, "FEDEX_EXPRESS_SAVER");
    assert.equal(resolved.service.carrierCode, "FDXE");
    assert.equal(resolved.service.name, "Express Saver");
    assert.equal(resolved.service.rowId, labelServiceId, "the shipment records the ROW id");

    assert.equal(resolved.handoff.name, "Store Dropoff");
    assert.equal(resolved.handoff.code, "DROPOFF_AT_FEDEX_LOCATION");
    assert.equal(resolved.wantsPickup, false);
    assert.equal(resolved.schedule, null);

    assert.equal(resolved.pkg.rowId, packageId);
    assert.equal(resolved.pkg.weight.value, 3);
    assert.ok(resolved.pkg.dimensions.length > 0, "the package row's dimensions rode in");
    assert.equal(resolved.pkg.dimensions.units, "IN");

    assert.equal(resolved.declaredValue, 2500);
    assert.equal(resolved.payout.method, "ACH");
    assert.equal(resolved.row.fulfillment_id, draftId, "the draft rides the row for the attach");
  });
});

test("a carrier pickup assembles the schedulable handoff, and refuses without a schedule", async () => {
  await inPinnedTransaction(async () => {
    await primeCheckout(pickupMethodId);

    await assert.rejects(
      () => orderCreate.resolvePurchaseCheckout(customer.id, BODY),
      /date and a time/,
      "a pickup without a schedule was accepted"
    );

    const resolved = await orderCreate.resolvePurchaseCheckout(
      customer.id,
      { ...BODY, pickup_schedule: { date: "2026-09-15", time: "10:30:00" } }
    );
    assert.equal(resolved.handoff.name, "Carrier Pickup");
    assert.equal(resolved.handoff.code, "CONTACT_FEDEX_TO_SCHEDULE");
    assert.equal(resolved.schedule?.date, "2026-09-15");
  });
});

test("an incomplete checkout is refused naming what is missing", async () => {
  await inPinnedTransaction(async () => {
    await assert.rejects(
      () => orderCreate.resolvePurchaseCheckout(customer.id, BODY),
      /missing .*shipper_address_id/,
      "an empty checkout assembled"
    );
  });
});

test("a missing payout and a missing weight refuse before anything happens", async () => {
  await inPinnedTransaction(async () => {
    await primeCheckout(dropoffMethodId);

    await assert.rejects(
      () => orderCreate.resolvePurchaseCheckout(customer.id, { ...BODY, payout: {} }),
      /payout needs a method/
    );
    await assert.rejects(
      () =>
        orderCreate.resolvePurchaseCheckout(customer.id, {
          ...BODY,
          package_weight: { units: "LB", value: 0 },
        }),
      /needs a weight/
    );
  });
});

test("a sale delivery service buys no labels - the agnostic row refuses", async () => {
  await inPinnedTransaction(async () => {
    await primeCheckout(dropoffMethodId);
    await as(customer, () =>
      request(app).patch("/api/checkout").send({
        direction: "purchase",
        carrier_service_id: saleServiceId,
      })
    );
    await assert.rejects(
      () => orderCreate.resolvePurchaseCheckout(customer.id, BODY),
      /not a label service/,
      "a carrier-agnostic sale row was accepted as a label service"
    );
  });
});

test("a non-SHIPMENT fulfillment refuses the shipping checkout", async () => {
  await inPinnedTransaction(async () => {
    await primeCheckout(dropoffMethodId);
    const moved = await as(customer, () =>
      request(app).post("/api/checkout/fulfillment").send({
        direction: "purchase",
        method_id: directMethodId,
      })
    );
    assert.equal(moved.status, 200, moved.text);

    await assert.rejects(
      () => orderCreate.resolvePurchaseCheckout(customer.id, BODY),
      /cannot be placed through the shipping checkout/
    );
  });
});

test("the record half: order core, bank-details anchor, shipment, reset", async () => {
  await inPinnedTransaction(async (c: PoolClient) => {
    // CARRIER PICKUP on purpose: the shipment write's chooseDefault fallback
    // is CARRIER DROPOFF, so the surviving method proving the DRAFT won the
    // unique slot is the whole assertion.
    const draftId = await primeCheckout(pickupMethodId);
    const resolved = await orderCreate.resolvePurchaseCheckout(customer.id, {
      ...BODY, pickup_schedule: { date: "2026-09-15", time: "10:30:00" },
    });
    assert.equal(resolved.row.fulfillment_id, draftId);

    // Rows only: no label object, no provider call - a null tracking number
    // is a real state (labels are voided and reissued).
    const placed = await orderCreate.recordPlacedPurchase(c, {
      user_id: customer.id, resolved, netCharge: 24.5,
      label: null,
      pickupResult: { confirmationNumber: "9971234", location: "FRONT" },
    });

    const { rows: [order] } = await c.query(
      `SELECT direction, status, number FROM orders.orders WHERE id = $1`, [placed.order_id]
    );
    assert.equal(order.direction, "purchase");
    assert.equal(order.status, "In Transit");

    // THE DRAFT WON: one fulfillment, and it is the customer's.
    const { rows: fulfillments } = await c.query(
      `SELECT f.id, m.type FROM fulfillments.fulfillments f
        JOIN fulfillments.methods m ON m.id = f.method_id
       WHERE f.order_id = $1`, [placed.order_id]
    );
    assert.equal(fulfillments.length, 1, "the order grew a second fulfillment");
    assert.equal(fulfillments[0].id, draftId);
    assert.equal(fulfillments[0].type, "CARRIER PICKUP");

    // The bank-details anchor: same id, same number, in exchange - and the
    // payout hanging off it.
    const { rows: [anchor] } = await c.query(
      `SELECT order_number FROM exchange.purchase_orders WHERE id = $1`, [placed.order_id]
    );
    assert.ok(anchor, "the exchange anchor row was not written");
    assert.equal(Number(anchor.order_number), Number(placed.number));
    const { rows: [payout] } = await c.query(
      `SELECT method, account_holder_name FROM exchange.payouts WHERE order_id = $1`,
      [placed.order_id]
    );
    assert.equal(payout.method, "ACH");
    assert.equal(payout.account_holder_name, PAYOUT.account_holder_name);

    // The money row: postage priced by the server, the fee recorded, the
    // payout account linked (last4 only - the details row holds no numbers).
    const { rows: [totals] } = await c.query(
      `SELECT shipping, shipping_service, payout_fee, payout_details_id
         FROM orders.transactions WHERE order_id = $1`, [placed.order_id]
    );
    assert.equal(Number(totals.shipping), 24.5);
    assert.equal(totals.shipping_service, "Express Saver");
    assert.ok(totals.payout_details_id, "the payout account was not linked");

    // The parcel, ids straight off the checkout row, linked to the draft.
    const { rows: [shipment] } = await c.query(
      `SELECT s.carrier_service_id, s.package_id, s.pickup_type, s.cost, s.direction
         FROM shipping.shipments s
         JOIN fulfillments.shipments fs ON fs.shipment_id = s.id
        WHERE fs.fulfillment_id = $1`, [draftId]
    );
    assert.ok(shipment, "the parcel is not linked to the fulfillment");
    assert.equal(shipment.carrier_service_id, labelServiceId);
    assert.equal(shipment.package_id, packageId);
    assert.equal(shipment.pickup_type, "Carrier Pickup");
    assert.equal(Number(shipment.cost), 24.5);

    // The booking row for the courier.
    const { rows: [booking] } = await c.query(
      `SELECT confirmation_number FROM exchange.carrier_pickups WHERE order_id = $1`,
      [placed.order_id]
    );
    assert.equal(Number(booking?.confirmation_number), 9971234);

    // The row starts the next checkout clean.
    const fresh = await checkoutRows.getRow(customer.id, "purchase", c);
    assert.equal(fresh.fulfillment_id, null, "the row kept the attached draft");
    assert.equal(fresh.shipper_address_id, null, "the row was not reset");
    assert.equal(fresh.package_id, null);
  });
});

test("a checkout whose draft was already attached refuses the SECOND order", async () => {
  await inPinnedTransaction(async (c: PoolClient) => {
    await primeCheckout(dropoffMethodId);
    const first = await orderCreate.resolvePurchaseCheckout(customer.id, BODY);
    await orderCreate.recordPlacedPurchase(c, {
      user_id: customer.id, resolved: first, netCharge: 24.5,
    });
    // Manually un-reset the row (a crash between attach and reset) - the
    // stale checkout must refuse rather than mint an order around a spent
    // draft.
    await c.query(
      `UPDATE checkout.checkouts SET
         fulfillment_id = $2, shipper_address_id = $3,
         package_id = $4, carrier_service_id = $5
       WHERE user_id = $1 AND direction = 'purchase'`,
      [customer.id, first.row.fulfillment_id, addressId, packageId, labelServiceId]
    );
    await assert.rejects(
      () => orderCreate.resolvePurchaseCheckout(customer.id, BODY),
      /already belongs to an order/
    );
  });
});
