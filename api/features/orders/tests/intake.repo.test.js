// Resolving the description to rows, and recording it on the checkout.
//
// These are the half of the intake that needs a database. What they are mostly
// about is references that resolve to the WRONG row rather than to none - a
// package label that exists twice, a service identified only by a display
// string - because those produce an order that looks placed and is not the one
// the customer submitted.
import test, { after, before } from "node:test";
import assert from "node:assert/strict";
import pool from "#db";
import { LOCKS, takeLocks } from "#shared/testing/locks.ts";
import { decompose } from "#features/orders/intake.ts";
import * as intake from "#features/orders/intake.repo.ts";

let client;

before(async () => {
  client = await pool.connect();
});

after(async () => {
  client.release();
  await pool.end();
});

async function inRollback(fn) {
  await client.query("BEGIN");
  // checkout.checkouts is UNIQUE (user_id, direction) and features/checkout's
  // own tests write the same rows for the same borrowed users. One lock, taken
  // first, or the two files deadlock in the full run and pass in isolation.
  // checkout only - this file records choices and items, and never places
  // an order or writes an address.
  await takeLocks(client, LOCKS.ORDERS);
  try {
    await fn(client);
  } finally {
    await client.query("ROLLBACK");
  }
}

const aUser = async (c) => (await c.query(`SELECT id FROM auth.users LIMIT 1`)).rows[0].id;
const anAddress = async (c) => (await c.query(`SELECT id FROM places.addresses LIMIT 1`)).rows[0].id;

const block = (over = {}) => ({
  address: { id: null, name: "A Customer", phone_number: "5550000000" },
  package: { label: "Small Box", weight: { units: "LB", value: 3 } },
  pickup: { name: "Store Dropoff", date: "2026-09-01", time: "" },
  service: { serviceType: "FEDEX_EXPRESS_SAVER", serviceDescription: "Express Saver", netCharge: 24.5, code: "FDXE" },
  payout: { method: "ACH", account_holder_name: "A Customer", bank_name: "Test", cost: 0 },
  insurance: { declaredValue: { amount: 5000, currency: "USD" }, insured: true },
  items: [
    { type: "scrap", data: { id: "s1", metal: "Gold", quantity: 1, pre_melt: 10, post_melt: 9.5, purity: 0.9999, content: 9.4991, gross_unit: "g", bid_premium: 0.8 } },
  ],
  ...over,
});

test("a handoff resolves to the method the backfill would have picked", async () => {
  await inRollback(async (c) => {
    const id = await intake.methodId({ type: "CARRIER DROPOFF", direction: "purchase" }, c);
    assert.ok(id, "CARRIER DROPOFF is one of the eleven seeded methods");

    const { rows } = await c.query(
      `SELECT type, category, direction FROM fulfillments.methods WHERE id = $1`,
      [id]
    );
    assert.equal(rows[0].category, "SHIPMENT");
    assert.equal(rows[0].direction, "purchase");
  });
});

// The same type exists once per direction and they are different rows.
test("a method resolves per direction, not once", async () => {
  await inRollback(async (c) => {
    const buy = await intake.methodId({ type: "CARRIER DROPOFF", direction: "purchase" }, c);
    const sell = await intake.methodId({ type: "CARRIER DROPOFF", direction: "sale" }, c);
    assert.ok(buy && sell);
    assert.notEqual(buy, sell, "a purchase and a sale must not share a method row");
  });
});

// Three labels exist twice, once per carrier. Resolving on the label alone
// returns whichever row comes back first, which is a coin toss that looks like
// it worked.
test("a package label that exists for two carriers resolves to the right one", async () => {
  await inRollback(async (c) => {
    const { rows: dupes } = await c.query(
      `SELECT label FROM shipping.packages GROUP BY label HAVING count(*) > 1 LIMIT 1`
    );
    assert.ok(dupes.length, "dev no longer has a duplicated package label - this test is moot");
    const label = dupes[0].label;

    const fedex = await intake.packageId({ label, carrierName: "FedEx" }, c);
    const ups = await intake.packageId({ label, carrierName: "UPS" }, c);
    assert.ok(fedex && ups);
    assert.notEqual(fedex, ups);

    const { rows } = await c.query(
      `SELECT o.name FROM shipping.packages p
        JOIN shipping.carriers c2 ON c2.id = p.carrier_id
        JOIN organizations.organizations o ON o.id = c2.organization_id
       WHERE p.id = $1`,
      [fedex]
    );
    assert.equal(rows[0].name, "FedEx");
  });
});

// The frontend names a service three ways and only one of them matches
// anything stored. Worth asserting, because if code or provider_code is ever
// populated this resolution should move to it.
test("a service resolves by its description, because nothing else is stored", async () => {
  await inRollback(async (c) => {
    const id = await intake.serviceId({ description: "Express Saver", carrierName: "FedEx" }, c);
    assert.ok(id, "Express Saver is a seeded FedEx service");

    const { rows } = await c.query(
      `SELECT code, provider_code FROM shipping.services WHERE id = $1`,
      [id]
    );
    assert.ok(
      !rows[0].code && !rows[0].provider_code,
      "a service now carries a code - resolution should use it rather than a display string"
    );

    assert.equal(
      await intake.serviceId({ description: "FEDEX_EXPRESS_SAVER" }, c),
      null,
      "the serviceType enum is not what is stored"
    );
  });
});

test("an unresolvable name is null rather than an exception", async () => {
  await inRollback(async (c) => {
    assert.equal(await intake.packageId({ label: "Crate" }, c), null);
    assert.equal(await intake.serviceId({ description: "Teleport" }, c), null);
    assert.equal(await intake.methodId({ type: "DRONE", direction: "purchase" }, c), null);
    assert.equal(await intake.locationId("MOON_BASE", c), null);
  });
});

// A method that will not resolve is the one that is fatal, because
// fulfillments.method_id is NOT NULL and there is nothing to write without it.
test("resolve refuses a fulfillment method that does not exist", async () => {
  await inRollback(async (c) => {
    const described = decompose(block(), { direction: "purchase", userId: "u" });
    described.fulfillment.method_type = "DRONE DROP";
    await assert.rejects(
      () => intake.resolve(described, c),
      /no fulfillment method "DRONE DROP"/
    );
  });
});

test("resolve turns the whole description into ids", async () => {
  await inRollback(async (c) => {
    const described = decompose(block(), { direction: "purchase", userId: "u" });
    const ids = await intake.resolve(described, c);

    assert.ok(ids.fulfillment_method_id);
    assert.ok(ids.carrier_service_id);
    assert.ok(ids.package_id);
    assert.ok(ids.payment_method_id, "ACH is a seeded purchase payout method");
    assert.equal(ids.appointment_location_id, null, "a dropoff has no appointment");
  });
});

test("recording fills in the checkout columns the cart never touches", async () => {
  await inRollback(async (c) => {
    const user = await aUser(c);
    const address = await anAddress(c);
    const described = decompose(block(), { direction: "purchase", userId: user });
    const ids = await intake.resolve(described, c);

    const checkout_id = await intake.record({ described, ids, address_id: address }, c);

    const { rows } = await c.query(
      `SELECT * FROM checkout.checkouts WHERE id = $1`,
      [checkout_id]
    );
    const row = rows[0];
    assert.equal(row.direction, "purchase");
    assert.equal(row.fulfillment_method_id, ids.fulfillment_method_id);
    assert.equal(row.carrier_service_id, ids.carrier_service_id);
    assert.equal(row.package_id, ids.package_id);
    // The customer posts the metal, so their address is the shipper's.
    assert.equal(row.shipper_address_id, address);
    assert.equal(row.recipient_address_id, null);
    assert.equal(row.pickup_address_id, null);
  });
});

test("recording twice reuses the one checkout the user has per direction", async () => {
  await inRollback(async (c) => {
    const user = await aUser(c);
    const address = await anAddress(c);
    const described = decompose(block(), { direction: "purchase", userId: user });
    const ids = await intake.resolve(described, c);

    const first = await intake.record({ described, ids, address_id: address }, c);
    const again = await intake.record({ described, ids, address_id: address }, c);
    assert.equal(again, first, "UNIQUE (user_id, direction) - the cart is the checkout");

    const { rows } = await c.query(
      `SELECT count(*)::int AS n FROM checkout.items WHERE checkout_id = $1`,
      [first]
    );
    assert.equal(rows[0].n, 1, "re-recording replaced the items rather than adding to them");
  });
});

// The submitted block is what the customer is agreeing to. A stale cart must
// not be what gets ordered.
test("the submitted items replace whatever the cart held", async () => {
  await inRollback(async (c) => {
    const user = await aUser(c);
    const address = await anAddress(c);

    const stale = decompose(
      block({ items: [
        { type: "scrap", data: { id: "old", metal: "Silver", quantity: 9, content: 1 } },
      ] }),
      { direction: "purchase", userId: user }
    );
    const ids = await intake.resolve(stale, c);
    const checkout_id = await intake.record({ described: stale, ids, address_id: address }, c);

    const fresh = decompose(block(), { direction: "purchase", userId: user });
    await intake.record({ described: fresh, ids, address_id: address }, c);

    const { rows } = await c.query(
      `SELECT i.quantity, i.purity, m.name AS metal
         FROM checkout.items i
         LEFT JOIN metals.metals m ON m.id = i.metal_id
        WHERE i.checkout_id = $1`,
      [checkout_id]
    );
    assert.equal(rows.length, 1);
    assert.equal(rows[0].metal, "Gold", "the stale silver line survived");
    assert.equal(Number(rows[0].quantity), 1);
  });
});

// Purity was being stored as 1.000 until migration 058 widened the column. The
// checkout side has to keep it too, or the rounding comes back through the
// other door.
test("four nines of purity survive being recorded", async () => {
  await inRollback(async (c) => {
    const user = await aUser(c);
    const address = await anAddress(c);
    // The premium no longer rides in on the block - intake ignores a posted
    // bid_premium and resolves from rates (085). One open-ended band at 0.8
    // keeps the assertion the same number it always was, now with a source.
    const rates = [
      { metal: "Gold", unit: "troy_oz", min_qty: 0, max_qty: null, scrap_pct: 0.8, bullion_pct: 0.85 },
    ];
    const described = decompose(block(), { direction: "purchase", userId: user, rates });
    const ids = await intake.resolve(described, c);
    const checkout_id = await intake.record({ described, ids, address_id: address }, c);

    const { rows } = await c.query(
      `SELECT purity, content, premium, unit FROM checkout.items WHERE checkout_id = $1`,
      [checkout_id]
    );
    assert.equal(Number(rows[0].purity), 0.9999);
    assert.equal(Number(rows[0].content), 9.4991);
    assert.equal(Number(rows[0].premium), 0.8, "the premium should come from the rate band");
    assert.equal(rows[0].unit, "g");
  });
});

test("a pickup records the customer's address as the pickup address", async () => {
  await inRollback(async (c) => {
    const user = await aUser(c);
    const address = await anAddress(c);
    const described = decompose(
      block({ pickup: { name: "Pickup", date: "2026-09-05" } }),
      { direction: "purchase", userId: user }
    );
    const ids = await intake.resolve(described, c);
    const checkout_id = await intake.record({ described, ids, address_id: address }, c);

    const { rows } = await c.query(
      `SELECT pickup_address_id, shipper_address_id FROM checkout.checkouts WHERE id = $1`,
      [checkout_id]
    );
    assert.equal(rows[0].pickup_address_id, address);
    assert.equal(rows[0].shipper_address_id, null, "nobody is posting anything");
  });
});

test("an appointment records the location and the time", async () => {
  await inRollback(async (c) => {
    const user = await aUser(c);
    const address = await anAddress(c);
    const described = decompose(
      block({ pickup: { name: "Appointment", date: "2026-09-05T15:00:00Z" } }),
      { direction: "purchase", userId: user }
    );
    const ids = await intake.resolve(described, c);
    assert.ok(ids.appointment_location_id, "an appointment happens somewhere");

    const checkout_id = await intake.record({ described, ids, address_id: address }, c);
    const { rows } = await c.query(
      `SELECT appointment_location_id, appointment_time FROM checkout.checkouts WHERE id = $1`,
      [checkout_id]
    );
    assert.equal(rows[0].appointment_location_id, ids.appointment_location_id);
    assert.equal(
      new Date(rows[0].appointment_time).toISOString(),
      new Date("2026-09-05T15:00:00Z").toISOString()
    );
  });
});
