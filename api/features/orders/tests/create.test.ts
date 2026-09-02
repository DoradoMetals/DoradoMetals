// A checkout ROW becomes an order (D208).
//
// The intake chain (block -> describe -> resolve -> record) is DELETED: the
// stepper writes ids onto checkout.checkouts directly now, so these tests
// prime the row the same way - straight fixture writes in a rolled-back
// transaction - and then run the one creation path that exists.
import test, { before, after } from "node:test";
import assert from "node:assert/strict";
import type { PoolClient } from "pg";
import pool from "#db";
import { createFromCheckout } from "#features/orders/create.ts";
import { takeLocks, LOCKS } from "#shared/testing/locks.ts";

let client: PoolClient;

before(async () => {
  client = await pool.connect();
});

after(async () => {
  client.release();
  await pool.end();
});

async function inRollback(fn: (c: PoolClient) => Promise<void>) {
  await client.query("BEGIN");
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

const aUser = async (c: PoolClient) => (await c.query(`SELECT id FROM auth.users LIMIT 1`)).rows[0].id;
const anAddress = async (c: PoolClient) => (await c.query(`SELECT id FROM places.addresses LIMIT 1`)).rows[0].id;
const aLocation = async (c: PoolClient) => (await c.query(`SELECT id FROM places.locations LIMIT 1`)).rows[0].id;

type ScrapItem = {
  metal: string | null; quantity?: number; pre_melt?: number; post_melt?: number;
  purity?: number; content?: number; unit?: string; premium?: number;
};
const GOLD: ScrapItem = {
  metal: "Gold", quantity: 1, pre_melt: 10, post_melt: 9.5,
  purity: 0.9999, content: 9.4991, unit: "g", premium: 0.8,
};

// Prime the checkout ROW the way the stepper does - ids on the row, items in
// checkout.items - then create. `method` is a fulfillments.methods TYPE, or
// null for "nothing chosen".
async function place(
  c: PoolClient,
  {
    method = "CARRIER DROPOFF" as string | null,
    items = [GOLD] as ScrapItem[],
    withPickupAddress = false,
    withAppointment = false,
    appointment_time = null as string | null,
    direction = "purchase",
    status = "In Transit",
  } = {}
) {
  const user = await aUser(c);
  const address = await anAddress(c);

  const { rows: [co] } = await c.query(
    `INSERT INTO checkout.checkouts (user_id, direction) VALUES ($1, $2)
     ON CONFLICT (user_id, direction) DO UPDATE SET user_id = EXCLUDED.user_id
     RETURNING id`,
    [user, direction]
  );
  const checkout_id = co.id;

  let method_id: string | null = null;
  if (method) {
    const { rows } = await c.query(
      `SELECT id FROM fulfillments.methods WHERE type = $1 AND direction = $2`,
      [method, direction]
    );
    method_id = rows[0]?.id ?? null;
    assert.ok(method_id, `the seed has no ${method} method for a ${direction}`);
  }

  await c.query(
    `UPDATE checkout.checkouts SET
       fulfillment_method_id = $2, fulfillment_id = NULL,
       shipper_address_id = $3, pickup_address_id = $4,
       appointment_location_id = $5, appointment_time = $6
     WHERE id = $1`,
    [
      checkout_id, method_id,
      direction === "purchase" ? address : null,
      withPickupAddress ? address : null,
      withAppointment ? await aLocation(c) : null,
      appointment_time,
    ]
  );

  await c.query(`DELETE FROM checkout.items WHERE checkout_id = $1`, [checkout_id]);
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
        checkout_id, item.metal, item.pre_melt ?? null, item.post_melt ?? null,
        item.purity ?? null, item.content ?? null, item.unit ?? null,
        item.premium ?? null, item.quantity ?? 1,
      ]
    );
  }

  const placed = await createFromCheckout({ checkout_id, status }, c);
  return { ...placed, user, address, checkout_id };
}

test("a checkout becomes an order with its items and its fulfillment", async () => {
  await inRollback(async (c: PoolClient) => {
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
    // NOT the 0.8 the row carried. The premium a customer is paid comes from
    // the rates table, not from their browser - retierScrapPremiums overwrites
    // whatever was submitted.
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
  await inRollback(async (c: PoolClient) => {
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
    // The number drawn is above where the sequence stood before, and no
    // exchange order already has it. (Not `number === last_value`: a sequence
    // is non-transactional and other tests draw from it concurrently.)
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
  await inRollback(async (c: PoolClient) => {
    const { order_id, address } = await place(c);

    const { rows } = await c.query(
      `SELECT address_id, source_address_id FROM orders.addresses WHERE order_id = $1`,
      [order_id]
    );
    assert.equal(rows[0].source_address_id, address, "the book row it came from");
    assert.notEqual(rows[0].address_id, address, "a snapshot must be its own row");

    await c.query(`UPDATE places.addresses SET city = 'Moved' WHERE id = $1`, [address]);
    const { rows: snap } = await c.query(
      `SELECT city FROM places.addresses WHERE id = $1`,
      [rows[0].address_id]
    );
    assert.notEqual(snap[0].city, "Moved", "the order's address changed underneath it");
  });
});

test("spots are frozen per metal the order actually contains", async () => {
  await inRollback(async (c: PoolClient) => {
    const { order_id } = await place(c, {
      items: [
        { metal: "Gold", quantity: 1, content: 1 },
        { metal: "Silver", quantity: 1, content: 2 },
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
    assert.equal(rows.length, 2);
  });
});

test("a pickup order books the pickup and a dropoff does not", async () => {
  await inRollback(async (c: PoolClient) => {
    const { fulfillment_id, address } = await place(c, {
      method: "PICKUP",
      withPickupAddress: true,
      appointment_time: "2026-09-05T15:00:00Z",
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
  await inRollback(async (c: PoolClient) => {
    const { fulfillment_id } = await place(c, {
      method: "APPOINTMENT",
      withAppointment: true,
      appointment_time: "2026-09-05T15:00:00Z",
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
  await inRollback(async (c: PoolClient) => {
    const { fulfillment_id } = await place(c, { method: null });

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
  await inRollback(async (c: PoolClient) => {
    await assert.rejects(
      () => place(c, { items: [{ metal: "Unobtainium", quantity: 1 }] }),
      /has no metal/
    );
  });
});

test("an empty checkout cannot become an order", async () => {
  await inRollback(async (c: PoolClient) => {
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
test("an order and its fulfillment roll back together", async () => {
  const other = await pool.connect();
  let order_id;
  try {
    await inRollback(async (c: PoolClient) => {
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
