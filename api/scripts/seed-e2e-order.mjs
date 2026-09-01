// Seeds ONE disposable purchase order for the Playwright admin drawer spec.
//
// WHY NOT THE REAL ENDPOINT. POST /purchase_orders/create_purchase_order calls
// shippingOps.createLabel unconditionally - a FedEx label per invocation, which
// is an outside-world side effect a test suite must never mint. The service's
// own recordPurchaseOrder exists as "purely rows" (its words) precisely so the
// row-writing half can run with no provider call; this script is that half,
// invoked for the E2E customer.
//
// WRITES COMMIT, IN BOTH SCHEMAS - the same dual write the live path does, so
// the seeded order is real-shaped everywhere the admin drawer looks. The order
// belongs to e2e-customer@example.invalid, carries an e2e-labelled address,
// and the spec that consumes it CANCELS it as its final act, so what
// accumulates in dev is legible, terminal, and owned by the E2E account.
// (The native purge for cancelled orders is the standing purgeCancelled port -
// these rows are more fuel for doing it.)
//
// Prints one JSON line: {"order_id": "...", "number": N}. Everything else goes
// to stderr so a consumer can parse stdout whole.
process.env.NODE_ENV = "test";

import "#env";
import pool from "#db";
import query from "#shared/db/query.ts";
import withTransaction from "#shared/db/withTransaction.ts";
import { recordPurchaseOrder } from "#features/orders/service.ts";
import * as addressService from "#features/places/addresses/service.ts";
import * as pickupService from "#features/shipping/pickups/service.ts";
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

// Any displayed product will do as the order's one line; the drawer prices it
// from live spots either way.
const { rows: products } = await query(
  `SELECT id FROM exchange.products WHERE display = true ORDER BY product_name LIMIT 1`
);
if (!products.length) {
  console.error("no displayed product in dev to put on the order");
  process.exit(1);
}

// A real FedEx service, so the new-schema shipment resolves carrier_service_id
// and pickup composition can reconstruct the carrier - the shape test picks
// "an order with a shipment" and must be able to pick this one.
const { rows: services } = await query(
  `SELECT cs.name FROM exchange.carrier_services cs
    JOIN exchange.carriers c ON c.id = cs.carrier_id
   WHERE c.name = 'FedEx' AND cs.is_active ORDER BY cs.name LIMIT 1`
);
if (!services.length) {
  console.error("no active FedEx service in dev to put on the shipment");
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

const order_id = await withTransaction(async (client) => {
  return recordPurchaseOrder(client, {
    user_id,
    purchase_order: {
      address: { ...address, id: address.id },
      items: [{ type: "product", data: { id: products[0].id, quantity: 1 } }],
      // No routing or account number, deliberately - the columns are nullable
      // (production has ACH payouts carrying none) and bank details never
      // belong in a seed.
      payout: { method: "ACH", account_holder_name: E2E_CUSTOMER.name },
      service: { serviceDescription: services[0].name, netCharge: 0 },
    },
    // No label object and no pickup: the shipment row records a null tracking
    // number, which is also a real state (labels are voided and reissued).
  });
});

// A scheduled CARRIER pickup rides every seeded order: the fixture that lets
// validate:wire parse GET /carrier_pickups and GET /shipments/:id/pickups,
// which sat "skipped for want of a fixture" while dev had no pickup rows.
// (The three still skipped - /fulfillments/schedule and the per-order
// pickups/directs - are the FULFILLMENTS handoff-booking resource, a
// different flow that deserves its own seed when that feature gets e2e.)
await pickupService.create({
  order_id,
  carrier: "FedEx",
  date: "2026-09-15",
  time: "10:30:00",
  pickup_status: "scheduled",
  confirmation_number: null,
  location: "FRONT",
});

const { rows: numbered } = await query(`SELECT number FROM orders.orders WHERE id = $1`, [order_id]);
console.log(JSON.stringify({ order_id, number: numbered[0]?.number ?? null }));
await pool.end();
