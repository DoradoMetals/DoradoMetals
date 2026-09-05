import { test, afterAll, beforeAll } from "vitest";
import assert from "node:assert/strict";
import type { Checkout } from "@dorado/contracts";
import type { PoolClient } from "pg";
import pool from "#pool";
import { LOCKS, takeLocks } from "#shared/testing/locks.ts";
import { rollbackIn } from "#shared/testing/rollback.ts";
import {
  aUser, anOrder, anAddress, fulfillmentMethodId, anId,
} from "#shared/testing/builders/index.ts";
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

const inRollback = rollbackIn({ lock: LOCKS.FULFILLMENTS });

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
    assert.ok(
      !offered.some((m) => m.type === "OWN LABEL" || m.type === "WALK IN"),
      "a hidden admin-only method reached the customer menu"
    );
  });
});

test("every direction has exactly one default shipment method", async () => {
  await inRollback(async (c: PoolClient) => {
    for (const direction of ["purchase", "sale"]) {
      const def = await methods.getDefault(direction, "SHIPMENT", c);
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

    const created = await repo.chooseById(order.id, method.id, c);
    assert.ok(created, "the fulfillment was not created");
    assert.equal(created.fulfillment.order_id, order.id);
    assert.equal(created.fulfillment.status, "PENDING");
    assert.equal(created.method.type, "PICKUP");
    assert.equal(created.pickup, null, "a new fulfillment is not scheduled yet");

    const found = await repo.getForOrder(order.id, null, true, c);
    assert.ok(found, "getForOrder could not read back the fulfillment it just created");
    assert.equal(found.fulfillment.id, created.fulfillment.id);
  });
});

test("a second create returns the same fulfillment rather than a second one", async () => {
  await inRollback(async (c: PoolClient) => {
    const order = await freeOrder(c, "purchase");
    const method = await methodOf(c, "PICKUP", "purchase");

    const first = await repo.chooseById(order.id, method.id, c);
    assert.ok(first, "the first create returned nothing");
    const again = await repo.chooseById(order.id, method.id, c);
    assert.ok(again, "the second create returned nothing");

    assert.equal(again.fulfillment.id, first.fulfillment.id, "one fulfillment per order, and create is idempotent");
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
    const orphan = anId();

    await assert.rejects(
      () => repo.chooseById(orphan, method.id, c),
      /not in orders\.orders/,
      "a missing order should be explained, not surfaced as a foreign key name"
    );
  });
});

test("a pickup is scheduled, rescheduled, and cancelled without touching the fulfillment", async () => {
  await inRollback(async (c: PoolClient) => {
    const order = await freeOrder(c, "purchase");
    const method = await methodOf(c, "PICKUP", "purchase");
    const f = await repo.chooseById(order.id, method.id, c);
    assert.ok(f, "the fulfillment could not be read back");

    const addr = [{ id: await anAddressId(c, order.user_id) }];
    const start = "2026-09-01T15:00:00Z";

    const booked = await pickupService.schedule(
      f.fulfillment.id,
      { pickup_address_id: addr[0].id, start_time: start },
      c
    );
    assert.ok(booked, "the schedule call returned no fulfillment");
    assert.ok(booked.pickup, "a scheduled fulfillment carries no pickup");
    assert.equal(booked.pickup.pickup_address_id, addr[0].id);
    assert.equal(booked.direct, null);

    assert.ok(booked.pickup.start_time, "the scheduled pickup carries no start time");
    assert.equal(
      new Date(booked.pickup.start_time).toISOString(),
      new Date(start).toISOString()
    );
    assert.match(JSON.stringify(booked.pickup.start_time), /[+-]\d{2}:\d{2}"$|Z"$/);

    const moved = await pickupService.schedule(
      f.fulfillment.id,
      { pickup_address_id: addr[0].id, start_time: "2026-09-02T15:00:00Z" },
      c
    );
    assert.ok(moved, "rescheduling returned no fulfillment");
    assert.ok(moved.pickup, "a rescheduled fulfillment carries no pickup");
    assert.equal(moved.pickup.id, booked.pickup.id);
    assert.ok(moved.pickup.start_time, "the rescheduled pickup carries no start time");
    assert.equal(new Date(moved.pickup.start_time).getUTCDate(), 2);

    const cancelled = await repo.cancelSchedule(f.fulfillment.id, c);
    assert.ok(cancelled, "cancelling returned no fulfillment");
    assert.equal(cancelled.pickup, null);
    assert.ok(cancelled.fulfillment.id, "cancelling a booking must not remove the fulfillment");
  });
});

test("an appointment is scheduled at a location", async () => {
  await inRollback(async (c: PoolClient) => {
    const order = await freeOrder(c, "sale");
    const method = await methodOf(c, "APPOINTMENT", "sale");
    const f = await repo.chooseById(order.id, method.id, c);
    assert.ok(f, "the fulfillment could not be read back");

    const { rows: loc } = await c.query(
      `SELECT id FROM places.locations WHERE type = 'DORADO_OFFICE' LIMIT 1`
    );
    const booked = await directService.schedule(
      f.fulfillment.id,
      {
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

test("a pickup cannot be booked against a method that is not a pickup", async () => {
  await inRollback(async (c: PoolClient) => {
    const order = await freeOrder(c, "sale");
    const method = await methodOf(c, "DROPSHIP", "sale");
    const f = await repo.chooseById(order.id, method.id, c);
    assert.ok(f, "the fulfillment could not be read back");
    const addr = [{ id: await anAddressId(c, order.user_id) }];

    await assert.rejects(
      () => pickupService.schedule(f.fulfillment.id, { pickup_address_id: addr[0].id }, c),
      /is a SHIPMENT, not a PICKUP/
    );
  });
});

test("changing the method takes the booking with it", async () => {
  await inRollback(async (c: PoolClient) => {
    const order = await freeOrder(c, "purchase");
    const pickup = await methodOf(c, "PICKUP", "purchase");
    const dropoff = await methodOf(c, "CARRIER DROPOFF", "purchase");
    const f = await repo.chooseById(order.id, pickup.id, c);
    assert.ok(f, "the fulfillment could not be read back");

    const addr = [{ id: await anAddressId(c, order.user_id) }];
    await pickupService.schedule(
      f.fulfillment.id,
      { pickup_address_id: addr[0].id, start_time: "2026-09-01T15:00:00Z" },
      c
    );

    const moved = await repo.setMethod(f.fulfillment.id, dropoff.id, c);
    assert.ok(moved, "the method move returned no fulfillment");
    assert.equal(moved.method.type, "CARRIER DROPOFF");
    assert.equal(
      moved.pickup,
      null,
      "the pickup survived a method change and would be read back as a second answer"
    );
  });
});

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
      () => repo.setMethod(rows[0].id, pickup.id, c),
      /already has a shipment/
    );
  });
});

test("the schedule lists only what somebody is due to attend", async () => {
  await inRollback(async (c: PoolClient) => {
    const order = await freeOrder(c, "purchase");
    const method = await methodOf(c, "PICKUP", "purchase");
    const f = await repo.chooseById(order.id, method.id, c);
    assert.ok(f, "the fulfillment could not be read back");
    const addr = [{ id: await anAddressId(c, order.user_id) }];
    await pickupService.schedule(
      f.fulfillment.id,
      { pickup_address_id: addr[0].id, start_time: "2026-09-01T15:00:00Z" },
      c
    );

    const due = await repo.getSchedule(
      "2026-08-31T00:00:00Z", "2026-09-02T00:00:00Z", null, c
    );
    assert.ok(due.some((x) => x.fulfillment.id === f.fulfillment.id), "the pickup just booked is not on the schedule");
    assert.ok(
      due.every((x) => x.method.category === "PICKUP" || x.method.category === "DIRECT"),
      "a shipment appeared on a list of places to be"
    );
    const august = await repo.getSchedule(
      "2026-08-01T00:00:00Z", "2026-08-31T00:00:00Z", null, c
    );
    assert.ok(!august.some((x) => x.fulfillment.id === f.fulfillment.id), "the window is not being applied");
  });
});

test("a customer cannot choose a method they were not offered", async () => {
  await inRollback(async (c: PoolClient) => {
    const order = await freeOrder(c, "purchase");
    const hidden = await methodOf(c, "OWN LABEL", "purchase");
    await assert.rejects(
      () =>
        service.choose(order.id, hidden.id, "purchase", c),
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
      await service.getForOrder(id, "00000000-0000-0000-0000-000000000000", false),
      null,
      "a signed-in stranger read somebody else's pickup address"
    );
    assert.ok(await service.getForOrder(id, user_id, false));
    assert.ok(await service.getForOrder(id, null, true));
  });
});

const anAddressId = async (c: PoolClient, user_id: string) =>
  (await anAddress(c, { id: user_id })).id;

const aLocation = async (c: PoolClient) =>
  (await c.query(`SELECT id FROM places.locations WHERE name = $1`,
    ["Dorado Return Address"])).rows[0].id;

test("the draft the stepper mutated becomes the order's own fulfillment", async () => {
  await inRollback(async (c: PoolClient) => {
    const order = await freeOrder(c, "purchase");
    const method = await methodOf(c, "CARRIER DROPOFF", "purchase");
    const draft = await service.createDraft(method.id, "purchase", c);
    assert.ok(draft, "no draft was created");

    const attached = await service.attachToOrder(draft.fulfillment.id, order.id, c);
    assert.equal(attached.fulfillment.id, draft.fulfillment.id, "a second fulfillment was minted");
    assert.equal(attached.fulfillment.order_id, order.id);
  });
});

test("a SHIPMENT draft is born with a parcel to fill in", async () => {
  await inRollback(async (c: PoolClient) => {
    const draft = await service.createDraft(
      (await methodOf(c, "CARRIER DROPOFF", "purchase")).id, "purchase", c
    );
    assert.ok(draft.parcel, "a SHIPMENT draft has no parcel row");
    assert.equal(draft.parcel.direction, "Inbound", "the customer's parcel is not inbound");
    assert.equal(draft.parcel.package_id, null, "the shell was born with choices in it");
    assert.deepEqual(
      draft.missing,
      ["shipper_address_id", "package_id", "carrier_service_id"]
    );
  });
});

test("a PICKUP draft owes its address and a time, and a patch clears them", async () => {
  await inRollback(async (c: PoolClient) => {
    const user = await aUser(c);
    const draft = await service.createDraft((await methodOf(c, "PICKUP", "purchase")).id, "purchase", c);
    assert.ok(draft.pickup, "a PICKUP draft has no collection row");
    assert.deepEqual(draft.missing, ["pickup_address_id", "start_time"]);

    const patched = await service.patchChoices(
      draft.fulfillment.id,
      { pickup: {
        pickup_address_id: await anAddressId(c, user.id),
        start_time: "2026-09-05T15:00:00Z",
      } },
      c
    );
    assert.deepEqual(patched.missing, []);
    assert.equal(await service.addressIdOf(draft.fulfillment.id, c), patched.pickup?.pickup_address_id);
  });
});

test("a DIRECT draft owes a location and a time", async () => {
  await inRollback(async (c: PoolClient) => {
    const draft = await service.createDraft((await methodOf(c, "APPOINTMENT", "purchase")).id, "purchase", c);
    assert.ok(draft.direct, "a DIRECT draft has no store-visit row");
    assert.deepEqual(draft.missing, ["location_id", "start_time"]);

    const patched = await service.patchChoices(
      draft.fulfillment.id,
      { direct: { location_id: await aLocation(c), start_time: "2026-09-05T15:00:00Z" } },
      c
    );
    assert.deepEqual(patched.missing, []);
    assert.equal(await service.addressIdOf(draft.fulfillment.id, c), null);
  });
});

test("a patch for the wrong category is refused", async () => {
  await inRollback(async (c: PoolClient) => {
    const draft = await service.createDraft((await methodOf(c, "PICKUP", "purchase")).id, "purchase", c);
    const location_id = await aLocation(c);
    await assert.rejects(
      () => service.patchChoices(draft.fulfillment.id, { direct: { location_id } }, c),
      /is a PICKUP, not a DIRECT/
    );
  });
});

test("an unlabelled draft may still move between categories", async () => {
  await inRollback(async (c: PoolClient) => {
    const draft = await service.createDraft(
      (await methodOf(c, "CARRIER DROPOFF", "purchase")).id, "purchase", c
    );
    const moved = await service.setMethod(
      draft.fulfillment.id, (await methodOf(c, "PICKUP", "purchase")).id, c
    );
    assert.equal(moved.method.category, "PICKUP");
    assert.ok(moved.pickup, "the new category has no detail row to fill in");
    assert.deepEqual(moved.missing, ["pickup_address_id", "start_time"]);
  });
});
