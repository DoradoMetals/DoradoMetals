// Seeds ONE disposable purchase order for the Playwright admin drawer spec.
//
// WHY NOT THE REAL ENDPOINT. `place()` calls world.buyPostage unconditionally,
// and the LIVE world buys a real FedEx label - an outside-world side effect a
// test suite must never mint. `place(checkout_id, world)` takes the World as
// an injectable seam precisely so a caller can run the same row-writing with
// no provider reachable; this script primes the SAME checkout row the stepper
// primes and calls `place` with a fake World, for the E2E customer.
//
// WRITES COMMIT, NATIVE SCHEMA ONLY (D210/D212) - the same rows the live path
// writes, so the seeded order is real-shaped everywhere the admin drawer
// looks. The order belongs to e2e-customer@example.invalid, carries an
// e2e-labelled address, and the spec that consumes it CANCELS it as its final
// act, so what accumulates in dev is legible, terminal, and owned by the E2E
// account. (The native purge for cancelled orders is the standing
// purgeCancelled port - these rows are more fuel for doing it.)
//
// NO BANK NUMBERS, deliberately: the payout step is primed as ECHECK to the
// e2e address's own email, so nothing is sealed and nothing plaintext ever
// enters a seed.
//
// Prints one JSON line: {"order_id": "...", "number": N}. Everything else goes
// to stderr so a consumer can parse stdout whole.
process.env.NODE_ENV = "test";

import "#env";
import pool from "#db";
import query from "#shared/db/query.ts";
import * as checkoutService from "#domain/checkout/service.ts";
import * as addressService from "#domain/places/addresses/service.ts";
import { place } from "#domain/orders/place.ts";

// THE FAKE WORLD: buyPostage answers a null-tracking, null-label postage with
// an unconfirmed FRONT pickup - the same fixture the old recordPlacedPurchase
// call built by hand - and confirm/authorize are no-ops, so nothing outside
// the database is ever touched. `place`'s purchase path never calls
// `authorize` (that is the sale side); it stays here only because World
// requires all three.
const world = {
  async buyPostage() {
    return {
      netCharge: 0,
      tracking_number: null,
      label: null,
      pickup: { confirmationNumber: null, location: "FRONT" },
    };
  },
  async authorize() {},
  async confirm() {},
};
// NOT imported from seed-e2e-users.mjs: that file is a script, not a module -
// importing it for the constant RUNS it, and it ends the shared pool on its
// way out, which killed this script's own queries. The values mirror its
// E2E_USERS.customer and must stay in step with it.
const E2E_CUSTOMER = { email: "e2e-customer@example.invalid", name: "E2E Customer" };

const { rows: users } = await query(`SELECT id FROM exchange.users WHERE email = $1`, [
  E2E_CUSTOMER.email,
]);
if (!users.length) {
  console.error("the e2e customer does not exist - run `pnpm --filter @dorado/api seed:e2e` first");
  process.exit(1);
}
const user_id = users[0].id;

// Any sellable product will do as the order's one line; the drawer prices it
// from live spots either way. The sell cart is keyed by NAME.
const { rows: products } = await query(
  `SELECT product_name FROM exchange.products WHERE sell_display = true ORDER BY product_name LIMIT 1`
);
if (!products.length) {
  console.error("no sellable product in dev to put on the order");
  process.exit(1);
}

// A real LABEL service (a carrier's own row, not a carrier-agnostic sale
// row), so the shipment resolves carrier_service_id and pickup composition
// can reconstruct the carrier.
const { rows: services } = await query(
  `SELECT id FROM shipping.services WHERE carrier_id IS NOT NULL ORDER BY name LIMIT 1`
);
if (!services.length) {
  console.error("no carrier label service in dev to put on the shipment");
  process.exit(1);
}

// A carrier-agnostic package the checkout offers.
const { rows: packages } = await query(
  `SELECT id FROM shipping.packages WHERE carrier_id IS NULL ORDER BY min_weight_lb NULLS FIRST LIMIT 1`
);
if (!packages.length) {
  console.error("no offered package in dev to put on the shipment");
  process.exit(1);
}

// The schedulable purchase handoff - a CARRIER PICKUP, so the seeded order
// carries the pickup fixture validate:wire parses GET /carrier_pickups with.
const { rows: methods } = await query(
  `SELECT id FROM fulfillments.methods
    WHERE direction = 'purchase' AND category = 'SHIPMENT' AND type = 'CARRIER PICKUP'
      AND enabled LIMIT 1`
);
if (!methods.length) {
  console.error("no CARRIER PICKUP fulfillment method in dev");
  process.exit(1);
}

// Find-or-create: one stable address for every seeded order. Minting one per
// run grew the e2e customer's address list until an unrelated account-page
// assertion drowned in them.
const { rows: existingAddr } = await query(
  `SELECT id FROM exchange.addresses
   WHERE user_id = $1 AND name = 'e2e-order-seed' LIMIT 1`,
  [user_id]
);

const address = existingAddr.length
  ? { id: existingAddr[0].id }
  : await addressService.create({
  userId: user_id,
  address: {
    line_1: "6100 E2E Seed St",
    city: "Houston",
    state: "TX",
    country: "United States",
    zip: "77005",
    country_code: "US",
    phone_number: "7135551234",
  },
  user_address: { label: 'e2e-order-seed' },
});

// Prime the checkout row exactly as the stepper does: the ids and parcel
// facts, the fulfillment draft, the payout account, the cart line.
await checkoutService.patchCheckout(user_id, "purchase", {
  shipper_address_id: address.id,
  package_id: packages[0].id,
  carrier_service_id: services[0].id,
  package_weight: 3,
  declared_value: 2500,
  pickup_date: "2026-09-15",
  pickup_time: "10:30:00",
});
await checkoutService.setFulfillmentMethod(user_id, "purchase", methods[0].id);
await checkoutService.saveCheckoutPayout(user_id, "purchase", {
  method: "ECHECK",
  payout_email: E2E_CUSTOMER.email,
  account_holder_name: E2E_CUSTOMER.name,
});
await checkoutService.syncCart(user_id, "purchase", [
  { type: "product", data: { name: products[0].product_name, quantity: 1 } },
]);

// The checkout row the priming above just wrote. `place` reads it by id.
const { id: checkout_id } = await checkoutService.getRowFor(user_id, "purchase");

// The one door orders are placed through, with the fake World: rows only, no
// FedEx call reachable. A null label is a real state (labels are voided and
// reissued); the pickup is recorded unconfirmed, which is also real
// (bookings confirm asynchronously).
const order = await place(checkout_id, world);

console.log(JSON.stringify({ order_id: order.order.id, number: order.order.number ?? null }));
await pool.end();
