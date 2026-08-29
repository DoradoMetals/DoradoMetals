// Fulfillments against real Postgres, each test inside a rolled-back
// transaction.
//
// This is the first feature with no exchange side to compare against, so there
// is no `diff` to fall back on: these tests are the only thing that says the
// PICKUP and DIRECT paths work. What they are asserting is mostly that the
// three categories cannot be mixed up, because the schema does not stop it -
// nothing prevents a pickups row hanging off a DROPSHIP fulfillment, and every
// read LEFT JOINs all three detail tables, so a mismatched row comes back as a
// second answer to a question with one answer.
import test, { after, before } from "node:test";
import assert from "node:assert/strict";
import pool from "#db";
import { LOCKS, takeLocks } from "#shared/testing/locks.ts";
// POINTED AT THE SERVICE, not at a repo. Every function this file exercises
// asks about a table the fulfillments repo does not own - whether the order
// exists, what category the method is, whether a parcel is attached - so after
// the per-table split they all live in the service. The assertions are
// unchanged, because the behaviour is.
import * as methods from "#features/fulfillments/methods/repo.ts";
import * as service from "#features/fulfillments/service.ts";
import * as pickupService from "#features/fulfillments/pickups/service.ts";
import * as directService from "#features/fulfillments/directs/service.ts";
const repo = service;

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
  // fulfillments_order_uniq means two tests borrowing the same order deadlock
  // rather than fail, and they pass in isolation while hanging in the full run.
  // One lock, taken first, in the one file that writes these tables.
  await takeLocks(client, LOCKS.FULFILLMENTS);
  try {
    await fn(client);
  } finally {
    await client.query("ROLLBACK");
  }
}

// An order with no fulfillment yet, so create() has something legal to attach
// to. Borrowed rather than invented: orders.orders is FK'd in six directions
// and a synthetic one would need all of them.
//
// Every purchase order in dev already has a fulfillment, so the one being
// borrowed has its fulfillment deleted first - inside the transaction that is
// about to be rolled back, which is the only reason that is not a data-loss
// bug. fulfillments.shipments cascades from it and comes back with it.
async function freeOrder(c, direction) {
  const { rows } = await c.query(
    `SELECT o.id, o.user_id FROM orders.orders o
      WHERE o.direction = $1::orders.direction
        AND NOT EXISTS (SELECT 1 FROM fulfillments.fulfillments f WHERE f.order_id = o.id)
      ORDER BY o.created_at DESC
      LIMIT 1`,
    [direction]
  );
  if (rows.length) return rows[0];

  const { rows: taken } = await c.query(
    `SELECT o.id, o.user_id FROM orders.orders o
      WHERE o.direction = $1::orders.direction
      ORDER BY o.created_at DESC LIMIT 1`,
    [direction]
  );
  const row = taken[0];
  if (!row) return null;
  await c.query(`DELETE FROM fulfillments.fulfillments WHERE order_id = $1`, [row.id]);
  return row;
}

const methodOf = async (c, type, direction) => {
  const { rows } = await c.query(
    `SELECT id, category FROM fulfillments.methods
      WHERE type = $1 AND direction = $2::orders.direction LIMIT 1`,
    [type, direction]
  );
  return rows[0];
};

test("the seed offers a customer only what is enabled and not hidden", async () => {
  await inRollback(async (c) => {
    const offered = await methods.getAvailable("purchase", c);
    assert.ok(offered.length > 0, "no purchase methods are offered at all");
    assert.ok(
      offered.every((m) => m.enabled && !m.hidden),
      "getAvailable returned a hidden or disabled method"
    );
    assert.ok(
      offered.every((m) => m.direction === "purchase"),
      "getAvailable returned a method for the other direction"
    );
    // WALK IN and OWN LABEL are enabled and hidden - an admin can put an order
    // on one and a customer cannot ask for it. If they ever show up here the
    // filter has stopped meaning anything.
    assert.ok(
      !offered.some((m) => m.type === "OWN LABEL" || m.type === "WALK IN"),
      "a hidden admin-only method reached the customer menu"
    );
  });
});

test("every direction has exactly one default shipment method", async () => {
  await inRollback(async (c) => {
    for (const direction of ["purchase", "sale"]) {
      const def = await methods.getDefault({ direction, category: "SHIPMENT" }, c);
      assert.ok(def, `no default SHIPMENT method for a ${direction}`);
      assert.equal(def.direction, direction);
      assert.equal(def.category, "SHIPMENT");
    }
  });
});

test("a fulfillment can be created for an order and is found by it", async () => {
  await inRollback(async (c) => {
    const order = await freeOrder(c, "purchase");
    assert.ok(order, "dev has no order to attach a fulfillment to");
    const method = await methodOf(c, "PICKUP", "purchase");

    const created = await repo.chooseById(
      { order_id: order.id, method_id: method.id },
      c
    );
    assert.equal(created.order_id, order.id);
    assert.equal(created.status, "PENDING");
    assert.equal(created.method.type, "PICKUP");
    assert.equal(created.pickup, null, "a new fulfillment is not scheduled yet");

    const found = await repo.getForOrder(order.id, { isAdmin: true }, c);
    assert.equal(found.id, created.id);
  });
});

test("a second create returns the same fulfillment rather than a second one", async () => {
  await inRollback(async (c) => {
    const order = await freeOrder(c, "purchase");
    const method = await methodOf(c, "PICKUP", "purchase");

    const first = await repo.chooseById({ order_id: order.id, method_id: method.id }, c);
    const again = await repo.chooseById({ order_id: order.id, method_id: method.id }, c);

    assert.equal(again.id, first.id, "one fulfillment per order, and create is idempotent");
    const { rows } = await c.query(
      `SELECT count(*)::int AS n FROM fulfillments.fulfillments WHERE order_id = $1`,
      [order.id]
    );
    assert.equal(rows[0].n, 1);
  });
});

test("creating a fulfillment for an order the new schema does not have says why", async () => {
  await inRollback(async (c) => {
    const method = await methodOf(c, "PICKUP", "purchase");
    // A real exchange order that orders.orders has no row for is the state
    // every order is in before ORDERS_SOURCE reaches dual.
    const { rows } = await c.query(
      `SELECT e.id FROM exchange.purchase_orders e
        WHERE NOT EXISTS (SELECT 1 FROM orders.orders o WHERE o.id = e.id)
        LIMIT 1`
    );
    const orphan = rows[0]?.id ?? "00000000-0000-0000-0000-000000000000";

    await assert.rejects(
      () => repo.chooseById({ order_id: orphan, method_id: method.id }, c),
      /not in orders\.orders/,
      "a missing order should be explained, not surfaced as a foreign key name"
    );
  });
});

test("a pickup is scheduled, rescheduled, and cancelled without touching the fulfillment", async () => {
  await inRollback(async (c) => {
    const order = await freeOrder(c, "purchase");
    const method = await methodOf(c, "PICKUP", "purchase");
    const f = await repo.chooseById({ order_id: order.id, method_id: method.id }, c);

    const { rows: addr } = await c.query(`SELECT id FROM places.addresses LIMIT 1`);
    const start = "2026-09-01T15:00:00Z";

    const booked = await pickupService.schedule(
      { fulfillment_id: f.id, pickup_address_id: addr[0].id, start_time: start },
      c
    );
    assert.equal(booked.pickup.pickup_address_id, addr[0].id);
    assert.equal(booked.direct, null);

    // THE DETAIL IS A REAL ROW NOW, NOT A jsonb_build_object, AND ITS
    // TIMESTAMPS ARRIVE AS Date OBJECTS.
    //
    // The old projection built the detail with jsonb_build_object, so the
    // driver never saw a timestamptz to parse and these came back as strings in
    // whatever rendering the session TimeZone produced - which this test's own
    // comment used to describe as "Postgres's and depends on the session
    // TimeZone". Reading the column directly means node-postgres parses it.
    //
    // OVER HTTP NOTHING CHANGES: res.json() serialises a Date to an ISO string
    // with a Z, and the contract describes the wire, so validate:wire compares
    // JSON.parse(JSON.stringify(row)) either way. What changed is the internal
    // value, and it changed in the direction of being stable rather than
    // session-dependent.
    //
    // The INSTANT is what was worth asserting all along, and it is unchanged.
    assert.equal(
      new Date(booked.pickup.start_time).toISOString(),
      new Date(start).toISOString()
    );
    assert.match(JSON.stringify(booked.pickup.start_time), /[+-]\d{2}:\d{2}"$|Z"$/);

    // Rescheduling is an upsert, not a second row: one pickup per fulfillment.
    const moved = await pickupService.schedule(
      { fulfillment_id: f.id, pickup_address_id: addr[0].id, start_time: "2026-09-02T15:00:00Z" },
      c
    );
    assert.equal(moved.pickup.id, booked.pickup.id);
    assert.equal(new Date(moved.pickup.start_time).getUTCDate(), 2);

    const cancelled = await repo.cancelSchedule(f.id, c);
    assert.equal(cancelled.pickup, null);
    assert.ok(cancelled.id, "cancelling a booking must not remove the fulfillment");
  });
});

test("an appointment is scheduled at a location", async () => {
  await inRollback(async (c) => {
    const order = await freeOrder(c, "sale");
    assert.ok(order, "dev has no sale order to attach a fulfillment to");
    const method = await methodOf(c, "APPOINTMENT", "sale");
    const f = await repo.chooseById({ order_id: order.id, method_id: method.id }, c);

    const { rows: loc } = await c.query(
      `SELECT id FROM places.locations WHERE type = 'DORADO_OFFICE' LIMIT 1`
    );
    const booked = await directService.schedule(
      {
        fulfillment_id: f.id,
        location_id: loc[0].id,
        start_time: "2026-09-01T15:00:00Z",
        end_time: "2026-09-01T15:30:00Z",
      },
      c
    );
    assert.equal(booked.direct.location_id, loc[0].id);
    assert.equal(booked.direct.is_appointment, true);
    assert.equal(booked.pickup, null);
  });
});

// The reason assertCategory exists. Nothing in the schema stops a pickups row
// hanging off a DROPSHIP fulfillment, and a read that LEFT JOINs all three
// would then answer with both a pickup and a shipment.
test("a pickup cannot be booked against a method that is not a pickup", async () => {
  await inRollback(async (c) => {
    const order = await freeOrder(c, "sale");
    const method = await methodOf(c, "DROPSHIP", "sale");
    const f = await repo.chooseById({ order_id: order.id, method_id: method.id }, c);
    const { rows: addr } = await c.query(`SELECT id FROM places.addresses LIMIT 1`);

    await assert.rejects(
      () => pickupService.schedule({ fulfillment_id: f.id, pickup_address_id: addr[0].id }, c),
      /is a SHIPMENT, not a PICKUP/
    );
  });
});

test("changing the method takes the booking with it", async () => {
  await inRollback(async (c) => {
    const order = await freeOrder(c, "purchase");
    const pickup = await methodOf(c, "PICKUP", "purchase");
    const dropoff = await methodOf(c, "CARRIER DROPOFF", "purchase");
    const f = await repo.chooseById({ order_id: order.id, method_id: pickup.id }, c);

    const { rows: addr } = await c.query(`SELECT id FROM places.addresses LIMIT 1`);
    await pickupService.schedule(
      { fulfillment_id: f.id, pickup_address_id: addr[0].id, start_time: "2026-09-01T15:00:00Z" },
      c
    );

    const moved = await repo.setMethod({ id: f.id, method_id: dropoff.id }, c);
    assert.equal(moved.method.type, "CARRIER DROPOFF");
    assert.equal(
      moved.pickup,
      null,
      "the pickup survived a method change and would be read back as a second answer"
    );
  });
});

// A shipment costs money and has a tracking number. Changing a dropdown must
// not be the thing that orphans it.
test("a fulfillment with a real shipment refuses to move off SHIPMENT", async () => {
  await inRollback(async (c) => {
    const { rows } = await c.query(
      `SELECT f.id FROM fulfillments.fulfillments f
        JOIN fulfillments.shipments s ON s.fulfillment_id = f.id
        JOIN fulfillments.methods m ON m.id = f.method_id
       WHERE m.direction = 'purchase' LIMIT 1`
    );
    assert.ok(rows.length, "dev has no shipped fulfillment to check");
    const pickup = await methodOf(c, "PICKUP", "purchase");

    await assert.rejects(
      () => repo.setMethod({ id: rows[0].id, method_id: pickup.id }, c),
      /already has a shipment/
    );
  });
});

test("the schedule lists only what somebody is due to attend", async () => {
  await inRollback(async (c) => {
    const order = await freeOrder(c, "purchase");
    const method = await methodOf(c, "PICKUP", "purchase");
    const f = await repo.chooseById({ order_id: order.id, method_id: method.id }, c);
    const { rows: addr } = await c.query(`SELECT id FROM places.addresses LIMIT 1`);
    await pickupService.schedule(
      { fulfillment_id: f.id, pickup_address_id: addr[0].id, start_time: "2026-09-01T15:00:00Z" },
      c
    );

    const due = await repo.getSchedule(
      { from: "2026-08-31T00:00:00Z", to: "2026-09-02T00:00:00Z" },
      c
    );
    assert.ok(due.some((x) => x.id === f.id), "the pickup just booked is not on the schedule");
    assert.ok(
      due.every((x) => x.method.category === "PICKUP" || x.method.category === "DIRECT"),
      "a shipment appeared on a list of places to be"
    );
    // The window is a window. A pickup in September is not on August's list.
    const august = await repo.getSchedule(
      { from: "2026-08-01T00:00:00Z", to: "2026-08-31T00:00:00Z" },
      c
    );
    assert.ok(!august.some((x) => x.id === f.id), "the window is not being applied");
  });
});

// The menu is only worth filtering if posting a method_id that was never on it
// is refused. OWN LABEL is hidden on purpose.
test("a customer cannot choose a method they were not offered", async () => {
  await inRollback(async (c) => {
    const order = await freeOrder(c, "purchase");
    const hidden = await methodOf(c, "OWN LABEL", "purchase");
    await assert.rejects(
      () =>
        service.choose(
          { order_id: order.id, method_id: hidden.id, direction: "purchase" },
          c
        ),
      /is not available for a purchase/
    );
  });
});

test("another customer's fulfillment is not readable by asking for its order", async () => {
  await inRollback(async (c) => {
    const { rows } = await c.query(
      `SELECT o.id, o.user_id FROM orders.orders o
        JOIN fulfillments.fulfillments f ON f.order_id = o.id
        WHERE o.user_id IS NOT NULL LIMIT 1`
    );
    assert.ok(rows.length, "dev has no owned order with a fulfillment");
    const { id, user_id } = rows[0];

    assert.equal(
      await service.getForOrder(id, { userId: "00000000-0000-0000-0000-000000000000" }),
      null,
      "a signed-in stranger read somebody else's pickup address"
    );
    assert.ok(await service.getForOrder(id, { userId: user_id }));
    assert.ok(await service.getForOrder(id, { userId: null, isAdmin: true }));
  });
});
