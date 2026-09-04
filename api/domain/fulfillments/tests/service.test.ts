// Fulfillments against real Postgres, each test inside a rolled-back transaction.
// The first feature with no exchange side to compare against, so these tests are the only thing proving PICKUP/DIRECT work - mostly, that the three categories can't be mixed up: nothing in the schema stops a pickups row hanging off a DROPSHIP fulfillment, and every read LEFT JOINs all three detail tables, so a mismatch comes back as a second answer to a one-answer question.
import { test, afterAll, beforeAll } from "vitest";
import assert from "node:assert/strict";
import type { PoolClient } from "pg";
import pool from "#pool";
import { LOCKS, takeLocks } from "#shared/testing/locks.ts";
import { rollbackIn } from "#shared/testing/rollback.ts";
import {
  aUser, anOrder, anAddress, fulfillmentMethodId, anId,
} from "#shared/testing/builders/index.ts";
// Pointed at the SERVICE, not a repo: every function here asks about a table the fulfillments repo doesn't own (whether the order exists, the method's category, whether a parcel is attached), so after the per-table split they all live in the service.
import * as methods from "#db/fulfillments/methods/repo.ts";
import * as service from "#domain/fulfillments/service.ts";
import * as pickupService from "#domain/fulfillments/pickups/service.ts";
import * as directService from "#domain/fulfillments/directs/service.ts";
const repo = service;


beforeAll(async () => {
});

afterAll(async () => {
  await pool.end();
});

// THE FILE'S LOCK, BOUND ONCE. A lock is a property of what this file
// WRITES, not of one call, so it is named here and every inRollback below
// inherits it - which is also what stops a new test being added without one.
  // fulfillments_order_uniq means two tests borrowing the same order deadlock rather than fail - one lock, taken first, in the one file that writes these tables.
const inRollback = rollbackIn({ lock: LOCKS.FULFILLMENTS });

// An order with no fulfillment yet, so create() has something legal to attach
// to. BUILT (lane 1), and this is the fixture whose old shape did the most
// damage on paper: it looked for an order nothing had attached to yet and,
// FAILING THAT, took the newest real order of that direction and DELETED its
// fulfillment - which is why the header had to explain that the rolled-back
// transaction was "the only reason that isn't a data-loss bug". It also
// returned null when the table was empty, and every caller then guarded.
//
// A built order has no fulfillment by construction, so nothing is borrowed and
// nothing is deleted. The lock stays: fulfillments_order_uniq is still one row
// per order and this file still writes the three detail tables.
async function freeOrder(c: PoolClient, direction: "purchase" | "sale") {
  const user = await aUser(c);
  const order = await anOrder(c, user, { direction });
  return { id: order.id, user_id: user.id };
}

const methodOf = async (c: PoolClient, type: string, direction: "purchase" | "sale") => {
  const id = await fulfillmentMethodId(c, type, direction);
  const { rows } = await c.query(
    `SELECT id, category FROM fulfillments.methods WHERE id = $1`, [id]
  );
  return rows[0];
};

test("the seed offers a customer only what is enabled and not hidden", async () => {
  await inRollback(async (c: PoolClient) => {
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
    // WALK IN and OWN LABEL are enabled and hidden - an admin can put an order on one, a customer cannot ask for it.
    assert.ok(
      !offered.some((m) => m.type === "OWN LABEL" || m.type === "WALK IN"),
      "a hidden admin-only method reached the customer menu"
    );
  });
});

test("every direction has exactly one default shipment method", async () => {
  await inRollback(async (c: PoolClient) => {
    for (const direction of ["purchase", "sale"]) {
      const def = await methods.getDefault({ direction, category: "SHIPMENT" }, c);
      assert.ok(def, `no default SHIPMENT method for a ${direction}`);
      assert.equal(def.direction, direction);
      assert.equal(def.category, "SHIPMENT");
    }
  });
});

test("a fulfillment can be created for an order and is found by it", async () => {
  await inRollback(async (c: PoolClient) => {
    const order = await freeOrder(c, "purchase");
    const method = await methodOf(c, "PICKUP", "purchase");

    const created = await repo.chooseById(
      { order_id: order.id, method_id: method.id },
      c
    );
    assert.ok(created, "the fulfillment was not created");
    assert.equal(created.order_id, order.id);
    assert.equal(created.status, "PENDING");
    assert.equal(created.method.type, "PICKUP");
    assert.equal(created.pickup, null, "a new fulfillment is not scheduled yet");

    const found = await repo.getForOrder(order.id, { isAdmin: true }, c);
    assert.ok(found, "getForOrder could not read back the fulfillment it just created");
    assert.equal(found.id, created.id);
  });
});

test("a second create returns the same fulfillment rather than a second one", async () => {
  await inRollback(async (c: PoolClient) => {
    const order = await freeOrder(c, "purchase");
    const method = await methodOf(c, "PICKUP", "purchase");

    const first = await repo.chooseById({ order_id: order.id, method_id: method.id }, c);
    assert.ok(first, "the first create returned nothing");
    const again = await repo.chooseById({ order_id: order.id, method_id: method.id }, c);
    assert.ok(again, "the second create returned nothing");

    assert.equal(again.id, first.id, "one fulfillment per order, and create is idempotent");
    const { rows } = await c.query(
      `SELECT count(*)::int AS n FROM fulfillments.fulfillments WHERE order_id = $1`,
      [order.id]
    );
    assert.equal(rows[0].n, 1);
  });
});

test("creating a fulfillment for an order the new schema does not have says why", async () => {
  await inRollback(async (c: PoolClient) => {
    const method = await methodOf(c, "PICKUP", "purchase");
    // AN ID THAT NAMES NO ORDER, WHICH IS THE WHOLE POINT. This looked for a
    // real exchange.purchase_orders row with no orders.orders counterpart -
    // dual-era residue - and fell back to an all-zero uuid when it found none,
    // so the test's subject depended on frozen data that D212 stopped feeding.
    // The claim is about a missing order, and a minted id is missing by
    // construction.
    const orphan = anId();

    await assert.rejects(
      () => repo.chooseById({ order_id: orphan, method_id: method.id }, c),
      /not in orders\.orders/,
      "a missing order should be explained, not surfaced as a foreign key name"
    );
  });
});

test("a pickup is scheduled, rescheduled, and cancelled without touching the fulfillment", async () => {
  await inRollback(async (c: PoolClient) => {
    const order = await freeOrder(c, "purchase");
    const method = await methodOf(c, "PICKUP", "purchase");
    const f = await repo.chooseById({ order_id: order.id, method_id: method.id }, c);
    assert.ok(f, "the fulfillment could not be read back");

    const addr = [{ id: await anAddressId(c, order.user_id) }];
    const start = "2026-09-01T15:00:00Z";

    const booked = await pickupService.schedule(
      { fulfillment_id: f.id, pickup_address_id: addr[0].id, start_time: start },
      c
    );
    assert.ok(booked, "the schedule call returned no fulfillment");
    assert.ok(booked.pickup, "a scheduled fulfillment carries no pickup");
    assert.equal(booked.pickup.pickup_address_id, addr[0].id);
    assert.equal(booked.direct, null);

    // The detail is a real row now, with timestamps arriving as Date objects (node-postgres parses timestamptz) rather than strings from a jsonb_build_object.
    // Over HTTP nothing changes: res.json() serializes a Date to an ISO string, and validate:wire compares the JSON either way - what changed is the internal value becoming stable rather than session-dependent.
    // GUARDED: start_time is nullable, and `new Date(null)` is the epoch, not an error - unguarded, an unscheduled pickup compared 1970 to the requested time and failed with two dates instead of naming the null.
    assert.ok(booked.pickup.start_time, "the scheduled pickup carries no start time");
    assert.equal(
      new Date(booked.pickup.start_time).toISOString(),
      new Date(start).toISOString()
    );
    assert.match(JSON.stringify(booked.pickup.start_time), /[+-]\d{2}:\d{2}"$|Z"$/);

    // Rescheduling reads first and updates: one pickup per fulfillment, not a second row.
    const moved = await pickupService.schedule(
      { fulfillment_id: f.id, pickup_address_id: addr[0].id, start_time: "2026-09-02T15:00:00Z" },
      c
    );
    assert.ok(moved, "rescheduling returned no fulfillment");
    assert.ok(moved.pickup, "a rescheduled fulfillment carries no pickup");
    assert.equal(moved.pickup.id, booked.pickup.id);
    assert.ok(moved.pickup.start_time, "the rescheduled pickup carries no start time");
    assert.equal(new Date(moved.pickup.start_time).getUTCDate(), 2);

    const cancelled = await repo.cancelSchedule(f.id, c);
    assert.ok(cancelled, "cancelling returned no fulfillment");
    assert.equal(cancelled.pickup, null);
    assert.ok(cancelled.id, "cancelling a booking must not remove the fulfillment");
  });
});

test("an appointment is scheduled at a location", async () => {
  await inRollback(async (c: PoolClient) => {
    const order = await freeOrder(c, "sale");
    const method = await methodOf(c, "APPOINTMENT", "sale");
    const f = await repo.chooseById({ order_id: order.id, method_id: method.id }, c);
    assert.ok(f, "the fulfillment could not be read back");

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
    assert.ok(booked, "the direct schedule call returned no fulfillment");
    assert.ok(booked.direct, "a directly-scheduled fulfillment carries no direct");
    assert.equal(booked.direct.location_id, loc[0].id);
    assert.equal(booked.direct.is_appointment, true);
    assert.equal(booked.pickup, null);
  });
});

// The reason assertCategory exists: nothing in the schema stops a pickups row hanging off a DROPSHIP fulfillment, and a read that LEFT JOINs all three would answer with both a pickup and a shipment.
test("a pickup cannot be booked against a method that is not a pickup", async () => {
  await inRollback(async (c: PoolClient) => {
    const order = await freeOrder(c, "sale");
    const method = await methodOf(c, "DROPSHIP", "sale");
    const f = await repo.chooseById({ order_id: order.id, method_id: method.id }, c);
    assert.ok(f, "the fulfillment could not be read back");
    const addr = [{ id: await anAddressId(c, order.user_id) }];

    await assert.rejects(
      () => pickupService.schedule({ fulfillment_id: f.id, pickup_address_id: addr[0].id }, c),
      /is a SHIPMENT, not a PICKUP/
    );
  });
});

test("changing the method takes the booking with it", async () => {
  await inRollback(async (c: PoolClient) => {
    const order = await freeOrder(c, "purchase");
    const pickup = await methodOf(c, "PICKUP", "purchase");
    const dropoff = await methodOf(c, "CARRIER DROPOFF", "purchase");
    const f = await repo.chooseById({ order_id: order.id, method_id: pickup.id }, c);
    assert.ok(f, "the fulfillment could not be read back");

    const addr = [{ id: await anAddressId(c, order.user_id) }];
    await pickupService.schedule(
      { fulfillment_id: f.id, pickup_address_id: addr[0].id, start_time: "2026-09-01T15:00:00Z" },
      c
    );

    const moved = await repo.setMethod({ id: f.id, method_id: dropoff.id }, c);
    assert.ok(moved, "the method move returned no fulfillment");
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
  await inRollback(async (c: PoolClient) => {
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
  await inRollback(async (c: PoolClient) => {
    const order = await freeOrder(c, "purchase");
    const method = await methodOf(c, "PICKUP", "purchase");
    const f = await repo.chooseById({ order_id: order.id, method_id: method.id }, c);
    assert.ok(f, "the fulfillment could not be read back");
    const addr = [{ id: await anAddressId(c, order.user_id) }];
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
  await inRollback(async (c: PoolClient) => {
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
  await inRollback(async (c: PoolClient) => {
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
    // `userId: null` deliberately: an anonymous caller's req.user?.id is undefined, matching the signature's `userId?: string` - isAdmin short-circuits before userId is read either way.
    assert.ok(await service.getForOrder(id, { isAdmin: true }));
  });
});

// ============================================================ the hand-over
//
// attachForCheckout is the whole of what placing an order asks of this feature
// (D214 item 11). It moved out of orders/place.ts, so its tests moved with it -
// including the two bookings, which a shipping checkout cannot reach at all
// (place() refuses a non-SHIPMENT draft) and an admin door will.

// An address of the order's own customer, BUILT - the pickup is booked at
// their door, and `SELECT id FROM places.addresses LIMIT 1` booked it at
// somebody else's.
const anAddressId = async (c: PoolClient, user_id: string) =>
  (await anAddress(c, { id: user_id })).id;

// The business's own address, by name: places.locations is seeded reference
// data (three rows) and an appointment happens at the one a customer walks
// into.
const aLocation = async (c: PoolClient) =>
  (await c.query(`SELECT id FROM places.locations WHERE name = $1`,
    ["Dorado Return Address"])).rows[0].id;

const handover = (
  order_id: string,
  over: {
    fulfillment_id?: string | null; method_id?: string | null;
    pickup_address_id?: string | null; location_id?: string | null;
    start_time?: string | null;
  } = {}
) => ({
  order_id,
  direction: "purchase" as const,
  fulfillment_id: over.fulfillment_id ?? null,
  method_id: over.method_id ?? null,
  pickup_address_id: over.pickup_address_id ?? null,
  location_id: over.location_id ?? null,
  start_time: over.start_time ?? null,
});

test("the draft the stepper mutated becomes the order's own fulfillment", async () => {
  await inRollback(async (c: PoolClient) => {
    const order = await freeOrder(c, "purchase");
    const method = await methodOf(c, "CARRIER DROPOFF", "purchase");
    const draft = await service.createDraft(
      { method_id: method.id, direction: "purchase" }, c
    );
    assert.ok(draft, "no draft was created");

    const attached = await service.attachForCheckout(
      handover(order.id, { fulfillment_id: draft.id }), c
    );
    assert.equal(attached.id, draft.id, "a second fulfillment was minted");
    assert.equal(attached.order_id, order.id);
  });
});

test("a checkout with no draft falls back to the method it named", async () => {
  await inRollback(async (c: PoolClient) => {
    const order = await freeOrder(c, "purchase");
    const method = await methodOf(c, "CARRIER PICKUP", "purchase");
    const attached = await service.attachForCheckout(
      handover(order.id, { method_id: method.id }), c
    );
    assert.equal(attached.method.type, "CARRIER PICKUP");
  });
});

// Defaulting is the seed's job, not a constant in the code - and a parcel in
// the post is not somewhere to be, whatever address the checkout carries.
test("a checkout that named nothing falls back to the direction's default", async () => {
  await inRollback(async (c: PoolClient) => {
    const order = await freeOrder(c, "purchase");
    const attached = await service.attachForCheckout(
      handover(order.id, { pickup_address_id: await anAddressId(c, order.user_id) }), c
    );
    assert.equal(attached.method.type, "CARRIER DROPOFF");
    assert.equal(attached.method.category, "SHIPMENT");
    assert.equal(attached.pickup, null, "a posted parcel was booked as a collection");
  });
});

test("a PICKUP method books the pickup", async () => {
  await inRollback(async (c: PoolClient) => {
    const order = await freeOrder(c, "purchase");
    const address = await anAddressId(c, order.user_id);
    const collected = await service.attachForCheckout(
      handover(order.id, {
        method_id: (await methodOf(c, "PICKUP", "purchase")).id,
        pickup_address_id: address,
        start_time: "2026-09-05T15:00:00Z",
      }),
      c
    );
    assert.ok(collected.pickup, "a PICKUP order was not scheduled");
    assert.equal(collected.pickup.pickup_address_id, address);
  });
});

test("an APPOINTMENT books the location and the time", async () => {
  await inRollback(async (c: PoolClient) => {
    const attached = await service.attachForCheckout(
      handover((await freeOrder(c, "purchase")).id, {
        method_id: (await methodOf(c, "APPOINTMENT", "purchase")).id,
        location_id: await aLocation(c),
        start_time: "2026-09-05T15:00:00Z",
      }),
      c
    );
    assert.ok(attached.direct, "an APPOINTMENT was not booked");
    assert.equal(attached.direct.is_appointment, true);
    assert.equal(
      new Date(attached.direct.start_time as unknown as string).toISOString(),
      new Date("2026-09-05T15:00:00Z").toISOString()
    );
  });
});
