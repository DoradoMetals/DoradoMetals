// Creating an order from a checkout, against real Postgres, each test inside a
// rolled-back transaction.
//
// The whole chain runs here for the first time: the block the frontend posts,
// decomposed, resolved, recorded on a checkout, and turned into an order with
// its items, its address snapshot and its fulfillment. What these are about is
// the handful of ways that chain could produce a plausible order that is not
// the one submitted.
import test, { after, before } from "node:test";
import assert from "node:assert/strict";
import pool from "#db";
import { LOCKS, takeLocks } from "#shared/testing/locks.ts";
import { decompose } from "#features/orders/intake.ts";
import * as intake from "#features/orders/intake.repo.ts";
import { createFromCheckout } from "#features/orders/create.ts";

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
  // Shares checkout.checkouts with intake.repo.test.js and features/checkout,
  // and orders.orders with several others. One lock, taken first.
  // Placing an order writes orders.*, checkout.* AND snapshots into
  // places.addresses, so this file takes both groups. takeLocks sorts them, so
  // the ascending-order rule cannot be got wrong here.
  await takeLocks(client, [LOCKS.ORDERS, LOCKS.ADDRESSES]);
  try {
    await fn(client);
  } finally {
    await client.query("ROLLBACK");
  }
}

const aUser = async (c) => (await c.query(`SELECT id FROM auth.users LIMIT 1`)).rows[0].id;
const anAddress = async (c) => (await c.query(`SELECT id FROM places.addresses LIMIT 1`)).rows[0].id;

const block = (over = {}) => ({
  address: { name: "A Customer", phone_number: "5550000000" },
  package: { label: "Small Box", weight: { units: "LB", value: 3 } },
  pickup: { name: "Store Dropoff", date: "2026-09-01", time: "" },
  service: { serviceType: "FEDEX_EXPRESS_SAVER", serviceDescription: "Express Saver", netCharge: 24.5, code: "FDXE" },
  payout: { method: "ACH", account_holder_name: "A Customer", cost: 0 },
  insurance: { declaredValue: { amount: 5000, currency: "USD" }, insured: true },
  items: [
    { type: "scrap", data: { id: "s1", metal: "Gold", quantity: 1, pre_melt: 10, post_melt: 9.5, purity: 0.9999, content: 9.4991, gross_unit: "g", bid_premium: 0.8 } },
  ],
  ...over,
});

// The whole chain in one call, because every test needs it.
async function place(c, over = {}, { direction = "purchase", status = "In Transit" } = {}) {
  const user = await aUser(c);
  const address = await anAddress(c);
  const described = decompose(block(over), { direction, userId: user });
  const ids = await intake.resolve(described, c);
  const checkout_id = await intake.record({ described, ids, address_id: address }, c);
  const placed = await createFromCheckout({ checkout_id, status }, c);
  return { ...placed, user, address, checkout_id, described };
}

test("a checkout becomes an order with its items and its fulfillment", async () => {
  await inRollback(async (c) => {
    const { order_id, number, fulfillment_id } = await place(c);

    const { rows: order } = await c.query(
      `SELECT direction, status, number, user_id FROM orders.orders WHERE id = $1`,
      [order_id]
    );
    assert.equal(order[0].direction, "purchase");
    assert.equal(order[0].status, "In Transit");
    assert.ok(Number(order[0].number) > 0);
    assert.equal(Number(order[0].number), Number(number));

    const { rows: items } = await c.query(
      `SELECT purity, content, premium, unit, quantity, metal_id
         FROM orders.items WHERE order_id = $1`,
      [order_id]
    );
    assert.equal(items.length, 1);
    assert.equal(Number(items[0].purity), 0.9999, "the rounding 058 fixed must not come back");
    assert.equal(Number(items[0].content), 9.4991);
    // NOT the 0.8 the block carried. The premium a customer is paid comes from
    // the rates table, not from their browser - retierScrapPremiums overwrites
    // whatever was submitted, exactly as the legacy path always has.
    assert.notEqual(Number(items[0].premium), 0.8, "the browser's premium survived");
    assert.ok(Number(items[0].premium) > 0, "the line was left with no premium at all");
    assert.ok(items[0].metal_id, "orders.items.metal_id is NOT NULL");

    const { rows: f } = await c.query(
      `SELECT m.type, m.category FROM fulfillments.fulfillments fu
         JOIN fulfillments.methods m ON m.id = fu.method_id
        WHERE fu.id = $1`,
      [fulfillment_id]
    );
    assert.equal(f[0].type, "CARRIER DROPOFF");
    assert.equal(f[0].category, "SHIPMENT");

    // Born with its engagement and the refiner counterparts (093's
    // invariants, maintained by the create path): one refiners.orders row,
    // one refiners.items row per line, a refiners.spots row per frozen spot.
    const { rows: eng } = await c.query(
      `SELECT id, refiner_id FROM refiners.orders WHERE order_id = $1`, [order_id]
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
      [order_id, eng[0].id]
    );
    assert.equal(mirrors[0].items, items.length, "a customer line has no linked refiner counterpart");
    assert.equal(mirrors[0].uncovered, 0, "a frozen spot has no refiner counterpart");
  });
});

// The two schemas share one numbering space while exchange is authoritative.
// An independent counter here would hand out numbers exchange hands out again.
test("the order number comes from exchange's sequence, so the two cannot collide", async () => {
  await inRollback(async (c) => {
    const { rows: before } = await c.query(
      `SELECT last_value FROM exchange.purchase_orders_order_number_seq`
    );
    const { number } = await place(c);
    const { rows: after } = await c.query(
      `SELECT last_value FROM exchange.purchase_orders_order_number_seq`
    );
    assert.ok(
      Number(after[0].last_value) > Number(before[0].last_value),
      "the shared sequence did not advance - two orders could take the same number"
    );

    // NOT `number === last_value`. That was the assertion here and it is racy:
    // a sequence is non-transactional - which is exactly why it is used - so
    // any other test drawing from it moves last_value even when its transaction
    // rolls back, and an advisory lock cannot make a sequence exclusive. It
    // failed as 1824 !== 1825 in a full run.
    //
    // What is actually true, and what matters: the number drawn is above where
    // the sequence stood before, and no exchange order already has it.
    assert.ok(
      Number(number) > Number(before[0].last_value),
      "the number drawn is not above where the sequence started"
    );

    const { rows: clash } = await c.query(
      `SELECT count(*)::int AS n FROM exchange.purchase_orders WHERE order_number = $1`,
      [number]
    );
    assert.equal(clash[0].n, 0, "the number handed out already belongs to an exchange order");
  });
});

// A snapshot, not a reference. Editing an address afterwards must not rewrite
// where a parcel was sent.
test("the order takes a copy of the address, not a pointer to it", async () => {
  await inRollback(async (c) => {
    const { order_id, address } = await place(c);

    const { rows } = await c.query(
      `SELECT address_id, source_address_id FROM orders.addresses WHERE order_id = $1`,
      [order_id]
    );
    assert.equal(rows[0].source_address_id, address, "the book row it came from");
    assert.notEqual(rows[0].address_id, address, "a snapshot must be its own row");

    // Editing the book row leaves the order's copy alone.
    await c.query(`UPDATE places.addresses SET city = 'Moved' WHERE id = $1`, [address]);
    const { rows: snap } = await c.query(
      `SELECT city FROM places.addresses WHERE id = $1`,
      [rows[0].address_id]
    );
    assert.notEqual(snap[0].city, "Moved", "the order's address changed underneath it");
  });
});

test("spots are frozen per metal the order actually contains", async () => {
  await inRollback(async (c) => {
    const { order_id } = await place(c, {
      items: [
        { type: "scrap", data: { id: "s1", metal: "Gold", quantity: 1, content: 1 } },
        { type: "scrap", data: { id: "s2", metal: "Silver", quantity: 1, content: 2 } },
      ],
    });

    const { rows } = await c.query(
      `SELECT m.name, s.ask, s.bid FROM orders.spots s
         JOIN metals.metals m ON m.id = s.metal_id
        WHERE s.order_id = $1 ORDER BY m.name`,
      [order_id]
    );
    assert.deepEqual(rows.map((r) => r.name), ["Gold", "Silver"]);
    assert.ok(Number(rows[0].ask) > 0, "a frozen spot with no price is not frozen");
    // No Platinum row: exchange writes one per metal whether or not the order
    // has any, and a spot for a metal nobody sold means nothing.
    assert.equal(rows.length, 2);
  });
});

test("a pickup order books the pickup and a dropoff does not", async () => {
  await inRollback(async (c) => {
    const { fulfillment_id, address } = await place(c, {
      pickup: { name: "Pickup", date: "2026-09-05T15:00:00Z" },
    });

    const { rows } = await c.query(
      `SELECT pickup_address_id, start_time FROM fulfillments.pickups WHERE fulfillment_id = $1`,
      [fulfillment_id]
    );
    assert.equal(rows.length, 1, "a PICKUP order was not scheduled");
    assert.equal(rows[0].pickup_address_id, address);

    const dropoff = await place(c);
    const { rows: none } = await c.query(
      `SELECT 1 FROM fulfillments.pickups WHERE fulfillment_id = $1`,
      [dropoff.fulfillment_id]
    );
    assert.equal(none.length, 0, "a parcel in the post is not somewhere to be");
  });
});

test("an appointment books the location and the time", async () => {
  await inRollback(async (c) => {
    const { fulfillment_id } = await place(c, {
      pickup: { name: "Appointment", date: "2026-09-05T15:00:00Z" },
    });
    const { rows } = await c.query(
      `SELECT location_id, is_appointment, start_time FROM fulfillments.directs
        WHERE fulfillment_id = $1`,
      [fulfillment_id]
    );
    assert.equal(rows.length, 1);
    assert.equal(rows[0].is_appointment, true);
    assert.equal(
      new Date(rows[0].start_time).toISOString(),
      new Date("2026-09-05T15:00:00Z").toISOString()
    );
  });
});

// A checkout with no method still has to become an order. Defaulting is the
// seed's job, not a constant here.
test("a checkout with no method chosen falls back to the direction's default", async () => {
  await inRollback(async (c) => {
    const user = await aUser(c);
    const address = await anAddress(c);
    const described = decompose(block({ pickup: undefined }), { direction: "purchase", userId: user });
    const ids = await intake.resolve(described, c);
    assert.equal(ids.fulfillment_method_id, null);

    const checkout_id = await intake.record({ described, ids, address_id: address }, c);
    const { fulfillment_id } = await createFromCheckout(
      { checkout_id, status: "In Transit" },
      c
    );

    const { rows } = await c.query(
      `SELECT m.type, m.is_default FROM fulfillments.fulfillments f
         JOIN fulfillments.methods m ON m.id = f.method_id WHERE f.id = $1`,
      [fulfillment_id]
    );
    assert.equal(rows[0].is_default, true);
    assert.equal(rows[0].type, "CARRIER DROPOFF");
  });
});

// An order silently missing a line is worse than an order that failed: the
// customer's metal arrives and nothing recorded that it was coming.
test("an item whose metal cannot be resolved fails the order rather than being dropped", async () => {
  await inRollback(async (c) => {
    const user = await aUser(c);
    const address = await anAddress(c);
    const described = decompose(
      block({ items: [{ type: "scrap", data: { id: "s1", metal: "Unobtainium", quantity: 1 } }] }),
      { direction: "purchase", userId: user }
    );
    const ids = await intake.resolve(described, c);
    const checkout_id = await intake.record({ described, ids, address_id: address }, c);

    await assert.rejects(
      () => createFromCheckout({ checkout_id, status: "In Transit" }, c),
      /has no metal/
    );
  });
});

test("an empty checkout cannot become an order", async () => {
  await inRollback(async (c) => {
    const user = await aUser(c);
    const { rows } = await c.query(
      `INSERT INTO checkout.checkouts (user_id, direction) VALUES ($1, 'sale')
       ON CONFLICT (user_id, direction) DO UPDATE SET user_id = EXCLUDED.user_id
       RETURNING id`,
      [user]
    );
    await c.query(`DELETE FROM checkout.items WHERE checkout_id = $1`, [rows[0].id]);
    await assert.rejects(
      () => createFromCheckout({ checkout_id: rows[0].id, status: "Pending" }, c),
      /no items/
    );
  });
});

// Placing an order touches five tables. Any one of them surviving a rollback is
// a row nothing points at and nobody would ever look for.
//
// Checked from a SECOND connection, because a query on the same client would be
// inside the very transaction it is trying to see past - and after the rollback
// the same client would answer honestly for the wrong reason. lint:db forbids
// pool.query; a deliberate second client is the shape the other dual-write
// tests use for exactly this.
test("an order and its fulfillment roll back together", async () => {
  const other = await pool.connect();
  let order_id;
  try {
    await inRollback(async (c) => {
      ({ order_id } = await place(c));
      const { rows } = await c.query(`SELECT 1 FROM orders.orders WHERE id = $1`, [order_id]);
      assert.equal(rows.length, 1, "the order was never written at all");

      const seen = await other.query(`SELECT 1 FROM orders.orders WHERE id = $1`, [order_id]);
      assert.equal(seen.rows.length, 0, "an uncommitted order was visible elsewhere");
    });

    const after = await other.query(
      `SELECT
         (SELECT count(*)::int FROM orders.orders WHERE id = $1) AS o,
         (SELECT count(*)::int FROM fulfillments.fulfillments WHERE order_id = $1) AS f,
         (SELECT count(*)::int FROM orders.items WHERE order_id = $1) AS i,
         (SELECT count(*)::int FROM orders.spots WHERE order_id = $1) AS s,
         (SELECT count(*)::int FROM orders.addresses WHERE order_id = $1) AS a`,
      [order_id]
    );
    assert.deepEqual(
      after.rows[0],
      { o: 0, f: 0, i: 0, s: 0, a: 0 },
      "the rollback left something behind"
    );
  } finally {
    other.release();
  }
});
