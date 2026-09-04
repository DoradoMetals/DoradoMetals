// A checkout ROW becomes an order, through the ONE DOOR (D214 item 11).
//
// The three seams are gone - createFromCheckout, resolvePurchase and
// recordPurchase were exported so the row flow could be asserted with no
// provider reachable, and a use case does not owe its tests a private entrance.
// These drive `place(checkout_id, world)` instead, with the two calls that
// leave the building stubbed AT THE PROVIDER BOUNDARY: shared/testing/
// no-network.ts refuses a real one loudly, so the stub says what the carrier
// answered rather than asking it.
import { test, afterAll } from "vitest";
import assert from "node:assert/strict";
import type { PoolClient } from "pg";
import pool from "#pool";
import { assertNothingEscaped, inPinnedTransaction } from "#shared/testing/pinned-pool.ts";
import { TEST_ACTOR } from "#shared/testing/actor.ts";
import { LOCKS } from "#shared/testing/locks.ts";
import * as place from "#domain/orders/place.ts";
import * as fulfillmentService from "#domain/fulfillments/service.ts";
import {
  aUser, anAddress, aProduct, metalId,
  packageId as builtPackageId, carrierServiceId, fulfillmentMethodId,
} from "#shared/testing/builders/index.ts";

// THE CUSTOMER AND THEIR ADDRESS ARE BUILT (lane 1); the three seeded
// reference rows are NAMED. This joined auth.users to places.user_addresses
// for "a non-admin with an address" - a real person, whose address the
// placement then snapshots and whose parcel it books - and took the package,
// the service and the method by LIMIT 1 on tables whose rows are literals of
// migration 047.
//
// Resolved inside the pin, per test, because that is where the placement runs.
let customer: string;
let addressId: string;
let packageId: string;
let labelServiceId: string;
let dropoffMethodId: string;

const aWorld = async (c: PoolClient) => {
  const person = await aUser(c, { name: "Placement Customer" });
  const address = await anAddress(c, person);
  customer = person.id;
  addressId = address.id;
  packageId = await builtPackageId(c, "Small Box");
  labelServiceId = await carrierServiceId(c, "Express Saver");
  dropoffMethodId = await fulfillmentMethodId(c, "CARRIER DROPOFF", "purchase");
  return { customer, addressId };
};

afterAll(async () => {
  await pool.end();
});

// A BUILDER, not a base object to spread over: what the carrier answered is
// three values, so a variant names the one it changes.
const carrierAnswers = (
  {
    netCharge = 24.5,
    tracking_number = "794123456789" as string | null,
    pickup = null as { confirmationNumber: string | null; location: string | null } | null,
  } = {}
): place.World => ({
  buyPostage: async () => ({ netCharge, tracking_number, label: null, pickup }),
  authorize: async () => {},
  confirm: async () => {},
});

type ScrapItem = {
  metal: string | null; quantity?: number; pre_melt?: number; post_melt?: number;
  purity?: number; content?: number; unit?: string; premium?: number;
};
const GOLD: ScrapItem = {
  metal: "Gold", quantity: 1, pre_melt: 10, post_melt: 9.5,
  purity: 0.9999, content: 9.4991, unit: "g", premium: 0.8,
};

// Prime the checkout ROW the way the stepper does: every choice an id on the
// row, every line a checkout.items row, the draft a real fulfillment.
async function primeCheckout(
  c: PoolClient,
  {
    items = [GOLD] as ScrapItem[],
    // Bullion lines, by catalogue id - a purchase cart carries the product's
    // own bid premium and the placement must NOT honour it.
    products = [] as { id: string; quantity?: number; premium?: number | null }[],
    withFulfillment = true,
  } = {}
): Promise<string> {
  const { rows: [details] } = await c.query(
    `INSERT INTO payments.details (user_id, account_holder, last_four)
     VALUES ($1, 'Row Flow Test', '6789') RETURNING id`,
    [customer]
  );
  const draft = withFulfillment
    ? await fulfillmentService.createDraft(
        { method_id: dropoffMethodId, direction: "purchase" }, c
      )
    : null;

  const { rows: [co] } = await c.query(
    `INSERT INTO checkout.checkouts (user_id, direction) VALUES ($1, 'purchase')
     ON CONFLICT (user_id, direction) DO UPDATE SET user_id = EXCLUDED.user_id
     RETURNING id`,
    [customer]
  );
  await c.query(
    `UPDATE checkout.checkouts SET
       fulfillment_id = $2, fulfillment_method_id = $3, shipper_address_id = $4,
       package_id = $5, carrier_service_id = $6, payment_details_id = $7
     WHERE id = $1`,
    [co.id, draft?.fulfillment.id ?? null, dropoffMethodId, addressId, packageId, labelServiceId, details.id]
  );

  await c.query(`DELETE FROM checkout.items WHERE checkout_id = $1`, [co.id]);
  for (const item of items) {
    await c.query(
      `INSERT INTO checkout.items (
         checkout_id, bullion_id, metal_id, pre_melt, post_melt, purity,
         content, unit, premium, quantity
       ) VALUES (
         $1, NULL, (SELECT id FROM metals.metals WHERE lower(name) = lower($2)),
         $3, $4, $5, $6, $7, $8, $9
       )`,
      [
        co.id, item.metal, item.pre_melt ?? null, item.post_melt ?? null,
        item.purity ?? null, item.content ?? null, item.unit ?? null,
        item.premium ?? null, item.quantity ?? 1,
      ]
    );
  }
  for (const product of products) {
    await c.query(
      `INSERT INTO checkout.items (checkout_id, bullion_id, metal_id, quantity, premium)
       VALUES ($1, $2, (SELECT metal_id FROM products.bullion WHERE id = $2), $3, $4)`,
      [co.id, product.id, product.quantity ?? 1, product.premium ?? null]
    );
  }
  return co.id;
}

// Placing an order writes orders.*, checkout.*, fulfillments.* AND snapshots
// into places.addresses, so this file takes both lock groups.
const inPinned = <T,>(fn: (c: PoolClient) => Promise<T>): Promise<T> =>
  inPinnedTransaction(fn, { actor: TEST_ACTOR.id, lock: [LOCKS.ORDERS, LOCKS.ADDRESSES] });

test("a checkout becomes an order with its items and its fulfillment", async () => {
  await inPinned(async (c: PoolClient) => {
    await aWorld(c);
    const order = await place.place(await primeCheckout(c), carrierAnswers());

    assert.equal(order.order.direction, "purchase");
    assert.equal(order.order.status, "In Transit");
    assert.ok(Number(order.order.number) > 0);
    assert.equal(order.order.user_id, customer);

    const { rows: items } = await c.query(
      `SELECT purity, content, premium, unit, quantity, metal_id
         FROM orders.items WHERE order_id = $1`,
      [order.order.id]
    );
    assert.equal(items.length, 1);
    assert.equal(Number(items[0].purity), 0.9999, "the rounding 058 fixed must not come back");
    assert.equal(Number(items[0].content), 9.4991);
    // NOT the 0.8 the row carried. The premium a customer is paid comes from
    // the rates table, not from their browser.
    assert.notEqual(Number(items[0].premium), 0.8, "the browser's premium survived");
    assert.ok(Number(items[0].premium) > 0, "the line was left with no premium at all");
    assert.ok(items[0].metal_id, "orders.items.metal_id is NOT NULL");

    const { rows: f } = await c.query(
      `SELECT m.type, m.category FROM fulfillments.fulfillments fu
         JOIN fulfillments.methods m ON m.id = fu.method_id
        WHERE fu.order_id = $1`,
      [order.order.id]
    );
    assert.equal(f[0].type, "CARRIER DROPOFF");
    assert.equal(f[0].category, "SHIPMENT");

    // Born with its engagement and the refiner counterparts (093's invariants):
    // one refiners.orders row, one refiners.items row per line, a refiners.spots
    // row per frozen spot.
    const { rows: eng } = await c.query(
      `SELECT id FROM refiners.orders WHERE order_id = $1`, [order.order.id]
    );
    assert.equal(eng.length, 1, "the order has no refiners.orders engagement row");
    const { rows: mirrors } = await c.query(
      `SELECT
         (SELECT count(*) FROM refiners.items ri
           JOIN orders.items oi ON oi.id = ri.order_item_id
          WHERE oi.order_id = $1 AND ri.refiner_order_id = $2)::int AS items,
         (SELECT count(*) FROM orders.spots os
          WHERE os.order_id = $1
            AND NOT EXISTS (SELECT 1 FROM refiners.spots rs
                             WHERE rs.order_id = os.order_id
                               AND rs.metal_id = os.metal_id))::int AS uncovered`,
      [order.order.id, eng[0].id]
    );
    assert.equal(mirrors[0].items, items.length, "a customer line has no linked refiner counterpart");
    assert.equal(mirrors[0].uncovered, 0, "a frozen spot has no refiner counterpart");
  });
});

// THE NUMBER IS NATIVE SINCE D213. What has to hold is that the counter
// advances and never hands out a number a customer has already seen - on EITHER
// side, because exchange's numbers are frozen history that appears in old
// emails and PDFs. 115 seeded past all of them; this proves it stayed past.
test("the order number comes from the native sequence and collides with nothing", async () => {
  await inPinned(async (c: PoolClient) => {
    await aWorld(c);
    const { rows: before } = await c.query(`SELECT last_value FROM orders.purchase_number_seq`);
    const order = await place.place(await primeCheckout(c), carrierAnswers());
    const { rows: after } = await c.query(`SELECT last_value FROM orders.purchase_number_seq`);

    assert.ok(
      Number(after[0].last_value) > Number(before[0].last_value),
      "the sequence did not advance - two orders could take the same number"
    );
    // Not `number === last_value`: a sequence is non-transactional and other
    // tests draw from it concurrently.
    assert.ok(
      Number(order.order.number) > Number(before[0].last_value),
      "the number drawn is not above where the sequence started"
    );
    // orders.orders alone: the exchange half of this check counted rows in a
    // table D212 stopped writing, so it could only ever have been zero.
    const { rows: clash } = await c.query(
      `SELECT count(*) AS n FROM orders.orders
        WHERE direction = 'purchase' AND number = $1 AND id <> $2`,
      [order.order.number, order.order.id]
    );
    assert.equal(Number(clash[0].n), 0, "the number handed out already belongs to an order");
  });
});

// A snapshot, not a reference. Editing an address afterwards must not rewrite
// where a parcel was sent.
test("the order takes a copy of the address, not a pointer to it", async () => {
  await inPinned(async (c: PoolClient) => {
    await aWorld(c);
    const order = await place.place(await primeCheckout(c), carrierAnswers());

    const { rows } = await c.query(
      `SELECT address_id, source_address_id FROM orders.addresses WHERE order_id = $1`,
      [order.order.id]
    );
    assert.equal(rows[0].source_address_id, addressId, "the book row it came from");
    assert.notEqual(rows[0].address_id, addressId, "a snapshot must be its own row");

    await c.query(`UPDATE places.addresses SET city = 'Moved' WHERE id = $1`, [addressId]);
    const { rows: snap } = await c.query(
      `SELECT city FROM places.addresses WHERE id = $1`, [rows[0].address_id]
    );
    assert.notEqual(snap[0].city, "Moved", "the order's address changed underneath it");
  });
});

test("spots are frozen per metal the order actually contains", async () => {
  await inPinned(async (c: PoolClient) => {
    await aWorld(c);
    const order = await place.place(
      await primeCheckout(c, {
        items: [
          { metal: "Gold", quantity: 1, content: 1 },
          { metal: "Silver", quantity: 1, content: 2 },
        ],
      }),
      carrierAnswers()
    );

    const { rows } = await c.query(
      `SELECT m.name, s.ask, s.bid FROM orders.spots s
         JOIN metals.metals m ON m.id = s.metal_id
        WHERE s.order_id = $1 ORDER BY m.name`,
      [order.order.id]
    );
    assert.deepEqual(rows.map((r) => r.name), ["Gold", "Silver"]);
    assert.ok(Number(rows[0].ask) > 0, "a frozen spot with no price is not frozen");
    assert.equal(rows.length, 2);
  });
});

// The parcel is written ONCE with everything known - the carrier's answer and
// the ids the checkout chose - rather than as a shell and an update.
test("the parcel records what the carrier said and what the checkout chose", async () => {
  await inPinned(async (c: PoolClient) => {
    await aWorld(c);
    const order = await place.place(
      await primeCheckout(c),
      carrierAnswers({ netCharge: 31.75, tracking_number: "794000000001" })
    );

    const { rows: [shipment] } = await c.query(
      `SELECT s.tracking_number, s.shipping_status, s.cost, s.insured, s.declared_value,
              s.package_id, s.carrier_service_id, s.pickup_type, s.direction
         FROM shipping.shipments s
         JOIN fulfillments.shipments fs ON fs.shipment_id = s.id
         JOIN fulfillments.fulfillments f ON f.id = fs.fulfillment_id
        WHERE f.order_id = $1`,
      [order.order.id]
    );
    assert.equal(shipment.tracking_number, "794000000001");
    assert.equal(shipment.shipping_status, "Label Created");
    assert.equal(Number(shipment.cost), 31.75);
    assert.equal(shipment.insured, true);
    // Computed from the checkout's own priced lines now (ruling 58), not a
    // fixed row value - a live spot and rate band, not a number this test
    // controls.
    assert.ok(Number(shipment.declared_value) > 0, "the parcel carries no declared value");
    assert.equal(shipment.package_id, packageId);
    assert.equal(shipment.carrier_service_id, labelServiceId);
    assert.equal(shipment.pickup_type, "Store Dropoff");
    assert.equal(shipment.direction, "Inbound");

    // The postage the server was quoted, on the order's money row.
    const { rows: [totals] } = await c.query(
      `SELECT shipping, shipping_service FROM orders.transactions WHERE order_id = $1`,
      [order.order.id]
    );
    assert.equal(Number(totals.shipping), 31.75);
    assert.equal(totals.shipping_service, "FEDEX_EXPRESS_SAVER");
  });
});

// An order silently missing a line is worse than an order that failed: the
// customer's metal arrives and nothing recorded that it was coming.
test("an item whose metal cannot be resolved fails the order rather than being dropped", async () => {
  await inPinned(async (c: PoolClient) => {
    await aWorld(c);
    const checkout_id = await primeCheckout(c, {
      items: [{ metal: "Unobtainium", quantity: 1 }],
    });
    await assert.rejects(() => place.place(checkout_id, carrierAnswers()), /has no metal/);
  });
});

// JACOB, 2026-09-03: "PURCHASE BULLION DOES NOT take its product bid premium.
// It comes from rates as well." The cart line carries the catalogue figure and
// placement overwrites it with the band, exactly as it always has for scrap.
test("a placed bullion line takes the rate band, not the premium the cart carried", async () => {
  await inPinned(async (c: PoolClient) => {
    await aWorld(c);
    // A GOLD PRODUCT WHOSE OWN PREMIUM IS NOT ITS BAND, BUILT (lane 1). This
    // hunted the catalogue with a lateral join for one that happened to differ
    // and then said "no gold product is off its band - this check would be
    // vacuous" if it found none. The band is read for ONE product's content
    // rather than searched across all of them, and the fixture's own premium
    // is then set deliberately away from it - so the assertion can never be
    // vacuous, on any database.
    const built = await aProduct(c, { metal: "Gold", content: 1, bid_premium: 1.5 });
    const { rows: [band] } = await c.query<{ bullion_pct: string }>(
      `SELECT r.bullion_pct FROM rates.rates r
        WHERE r.metal_id = $1 AND $2 >= r.min_qty
          AND (r.max_qty IS NULL OR $2 <= r.max_qty)
        ORDER BY r.min_qty`,
      [await metalId(c, "Gold"), built.content]
    );
    assert.ok(band, "the rates seed has no gold band for a one-ounce product");
    const product = {
      id: built.id, content: built.content,
      bid_premium: built.bid_premium, bullion_pct: band.bullion_pct,
    };
    assert.notEqual(
      Number(product.bid_premium), Number(product.bullion_pct),
      "the fixture's own premium equals its band, so this check would be vacuous"
    );

    const order = await place.place(
      await primeCheckout(c, {
        items: [],
        products: [{ id: product.id, quantity: 1, premium: Number(product.bid_premium) }],
      }),
      carrierAnswers()
    );

    const { rows: items } = await c.query(
      `SELECT bullion_id, premium FROM orders.items WHERE order_id = $1`, [order.order.id]
    );
    assert.equal(items.length, 1);
    assert.equal(items[0].bullion_id, product.id);
    assert.equal(
      Number(items[0].premium), Number(product.bullion_pct),
      "the placed bullion line is not at the band the order earned"
    );
    assert.notEqual(
      Number(items[0].premium), Number(product.bid_premium),
      "the cart's product bid_premium survived placement"
    );
  });
});

test("an empty checkout cannot become an order", async () => {
  await inPinned(async (c: PoolClient) => {
    await aWorld(c);
    const checkout_id = await primeCheckout(c, { items: [] });
    await assert.rejects(() => place.place(checkout_id, carrierAnswers()), /no items/);
  });
});

// Placing an order touches six tables. Any one of them surviving a rollback is
// a row nothing points at and nobody would ever look for - and reading it from
// inside the transaction proves nothing, since a test reads its own writes.
test("an order, its fulfillment and its parcel roll back together", async () => {
  let order_id = "";
  await inPinned(async (c: PoolClient) => {
    await aWorld(c);
    order_id = (await place.place(await primeCheckout(c), carrierAnswers())).order.id;
    const { rows } = await c.query(`SELECT 1 FROM orders.orders WHERE id = $1`, [order_id]);
    assert.equal(rows.length, 1, "the order was never written at all");
  });

  for (const [table, predicate] of [
    ["orders.orders", "id = $1"],
    ["orders.items", "order_id = $1"],
    ["orders.spots", "order_id = $1"],
    ["orders.addresses", "order_id = $1"],
    ["orders.transactions", "order_id = $1"],
    ["fulfillments.fulfillments", "order_id = $1"],
  ] as const) {
    assert.equal(
      await assertNothingEscaped(table, predicate, [order_id]), 0,
      `the rollback left a ${table} row behind`
    );
  }
});
