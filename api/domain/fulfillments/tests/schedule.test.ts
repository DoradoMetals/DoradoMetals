// The fulfillment write routes, over real HTTP - six routes no test had ever driven, from the list that has produced four production defects. These are how an admin books a customer in: which method fulfills an order, its status, and the appointment itself.
// All pure database work - checked each service/repo function before driving it: no email, FedEx or Stripe. fulfillments has no exchange side and never will, so there's no second implementation these could disagree with.
// The pickup test builds its own fixture, and that's the point: dev holds no PICKUP fulfillment at all, so it sets the method first through set_method and then books, proving the category guard is reached rather than skipped.
// NOTHING IS COMMITTED - shared/testing/pinned-pool.ts holds every query in one rolled-back transaction.
import test, { after, before } from "node:test";
import assert from "node:assert/strict";
import type { PoolClient } from "pg";
import request from "supertest";
import pool from "#db";
import { mockSessions, restoreSessions, as } from "#shared/testing/session.ts";
import { inPinnedTransaction, outside } from "#shared/testing/pinned-pool.ts";

await mockSessions();
const { default: app } = await import("#app");

// The structural subset each fixture actually has - SELECT projections, not table rows.
type UserFixture = { id: string; name: string | null; email: string | null };
type IdRow = { id: string };

let admin: UserFixture;
let shipmentFulfilment: IdRow;
let directFulfilment: IdRow;
let pickupMethodId: string;
let locationId: string;

before(async () => {
  admin = (
    await outside<UserFixture>(`SELECT id, name, email FROM exchange.users WHERE role = 'admin' LIMIT 1`)
  )[0];
  assert.ok(admin, "dev has no admin user");

  // Every SHIPMENT fulfillment in dev has a shipment (one exists because the other does), so setMethod's "move off SHIPMENT" path is unreachable from a SHIPMENT fixture - tested on the DIRECT fulfillment instead, with the SHIPMENT one used for the guard.
  // An earlier version asked for a SHIPMENT fulfillment with no shipment, found none, and every test in the file failed in `before` - which at least failed honestly rather than skipping.
  shipmentFulfilment = (
    await outside<IdRow>(
      `SELECT f.id FROM fulfillments.fulfillments f
         JOIN fulfillments.methods m ON m.id = f.method_id
         JOIN fulfillments.shipments s ON s.fulfillment_id = f.id
        WHERE m.category = 'SHIPMENT' ORDER BY f.id LIMIT 1`
    )
  )[0];
  assert.ok(shipmentFulfilment, "dev needs a SHIPMENT fulfillment that has a shipment");

  directFulfilment = (
    await outside<IdRow>(
      `SELECT f.id FROM fulfillments.fulfillments f
         JOIN fulfillments.methods m ON m.id = f.method_id
        WHERE m.category = 'DIRECT' ORDER BY f.id LIMIT 1`
    )
  )[0];
  assert.ok(directFulfilment, "dev needs a DIRECT fulfillment");

  pickupMethodId = (
    await outside<IdRow>(
      `SELECT id FROM fulfillments.methods
        WHERE category = 'PICKUP' AND direction = 'purchase' LIMIT 1`
    )
  )[0]?.id;
  assert.ok(pickupMethodId, "dev needs a PICKUP method");

  locationId = (await outside<IdRow>(`SELECT id FROM places.locations ORDER BY id LIMIT 1`))[0]?.id;
  assert.ok(locationId, "dev needs a location");
});

after(async () => {
  restoreSessions();
  await pool.end();
});

test("methods/update writes the method's flags", async () => {
  await inPinnedTransaction(async (client: PoolClient) => {
    await as({ ...admin, role: "admin" }, async () => {
      const before = await client.query(
        `SELECT id, hidden FROM fulfillments.methods WHERE id = $1`,
        [pickupMethodId]
      );
      const flipped = !before.rows[0].hidden;

      const res = await request(app)
        .post("/api/fulfillments/methods/update")
        .send({ method: { id: pickupMethodId, hidden: flipped } });

      assert.equal(res.status, 200, `answered ${res.status}: ${JSON.stringify(res.body)}`);

      const after = await client.query(
        `SELECT hidden FROM fulfillments.methods WHERE id = $1`,
        [pickupMethodId]
      );
      assert.equal(after.rows[0].hidden, flipped, "the method's hidden flag did not change");
    });
  });
});

test("set_status writes the fulfillment's status", async () => {
  await inPinnedTransaction(async (client: PoolClient) => {
    await as({ ...admin, role: "admin" }, async () => {
      const res = await request(app)
        .post("/api/fulfillments/set_status")
        .send({ fulfillment_id: shipmentFulfilment.id, status: "COMPLETED" });

      assert.equal(res.status, 200, `answered ${res.status}: ${JSON.stringify(res.body)}`);

      const { rows } = await client.query(
        `SELECT status FROM fulfillments.fulfillments WHERE id = $1`,
        [shipmentFulfilment.id]
      );
      assert.equal(rows[0].status, "COMPLETED", "the status did not change");
    });
  });
});

test("set_method moves the fulfillment onto another method", async () => {
  await inPinnedTransaction(async (client: PoolClient) => {
    await as({ ...admin, role: "admin" }, async () => {
      const res = await request(app)
        .post("/api/fulfillments/set_method")
        .send({ fulfillment_id: directFulfilment.id, method_id: pickupMethodId });

      assert.equal(res.status, 200, `answered ${res.status}: ${JSON.stringify(res.body)}`);

      const { rows } = await client.query(
        `SELECT method_id FROM fulfillments.fulfillments WHERE id = $1`,
        [directFulfilment.id]
      );
      assert.equal(rows[0].method_id, pickupMethodId, "the method did not change");
    });
  });
});

test("schedule_direct books the appointment", async () => {
  await inPinnedTransaction(async (client: PoolClient) => {
    await as({ ...admin, role: "admin" }, async () => {
      const res = await request(app)
        .post("/api/fulfillments/schedule_direct")
        .send({
          direct: {
            fulfillment_id: directFulfilment.id,
            location_id: locationId,
            is_appointment: true,
            start_time: "2026-09-01T15:00:00.000Z",
            end_time: "2026-09-01T15:30:00.000Z",
          },
        });

      assert.equal(res.status, 200, `answered ${res.status}: ${JSON.stringify(res.body)}`);

      const { rows } = await client.query(
        `SELECT location_id, is_appointment FROM fulfillments.directs WHERE fulfillment_id = $1`,
        [directFulfilment.id]
      );
      assert.ok(rows.length, "no direct booking was written");
      assert.equal(rows[0].location_id, locationId, "the booking is at the wrong location");
      assert.equal(rows[0].is_appointment, true, "the booking is not an appointment");
    });
  });
});

test("cancel_schedule removes the booking", async () => {
  await inPinnedTransaction(async (client: PoolClient) => {
    await as({ ...admin, role: "admin" }, async () => {
      await request(app)
        .post("/api/fulfillments/schedule_direct")
        .send({
          direct: {
            fulfillment_id: directFulfilment.id,
            location_id: locationId,
            is_appointment: true,
          },
        });

      const booked = await client.query(
        `SELECT 1 FROM fulfillments.directs WHERE fulfillment_id = $1`,
        [directFulfilment.id]
      );
      assert.equal(booked.rows.length, 1, "the fixture booking was not created");

      const res = await request(app)
        .post("/api/fulfillments/cancel_schedule")
        .send({ fulfillment_id: directFulfilment.id });

      assert.equal(res.status, 200, `answered ${res.status}: ${JSON.stringify(res.body)}`);

      const { rows } = await client.query(
        `SELECT 1 FROM fulfillments.directs WHERE fulfillment_id = $1`,
        [directFulfilment.id]
      );
      assert.equal(rows.length, 0, "the booking survived the cancel");
    });
  });
});

// Two routes in one, because the category guard makes them inseparable: dev has
// no PICKUP fulfillment, so the method has to move first.
test("schedule_pickup books once the fulfillment is moved onto a PICKUP method", async () => {
  await inPinnedTransaction(async (client: PoolClient) => {
    await as({ ...admin, role: "admin" }, async () => {
      const address = (
        await client.query(`SELECT id FROM places.addresses ORDER BY id LIMIT 1`)
      ).rows[0];
      assert.ok(address, "dev needs an address in places");

      await request(app)
        .post("/api/fulfillments/set_method")
        .send({ fulfillment_id: directFulfilment.id, method_id: pickupMethodId });

      const res = await request(app)
        .post("/api/fulfillments/schedule_pickup")
        .send({
          pickup: {
            fulfillment_id: directFulfilment.id,
            pickup_address_id: address.id,
            start_time: "2026-09-02T14:00:00.000Z",
            end_time: "2026-09-02T16:00:00.000Z",
          },
        });

      assert.equal(res.status, 200, `answered ${res.status}: ${JSON.stringify(res.body)}`);

      const { rows } = await client.query(
        `SELECT pickup_address_id FROM fulfillments.pickups WHERE fulfillment_id = $1`,
        [directFulfilment.id]
      );
      assert.ok(rows.length, "no pickup booking was written");
      assert.equal(rows[0].pickup_address_id, address.id, "booked at the wrong address");
    });
  });
});

// The guard, which is the more important half: moving an order off SHIPMENT while a shipment exists would leave a live FedEx label attached to a fulfillment that no longer claims to be one.
// Until this fix it refused with a bare Error (a generic 500, explanation lost to the log) - it now carries 409, which is what makes errorHandler pass the message through. Asserted here because a repo test can't see what the caller gets.
test("set_method refuses to move a fulfillment that already has a shipment, and says why", async () => {
  await inPinnedTransaction(async () => {
    await as({ ...admin, role: "admin" }, async () => {
      const res = await request(app)
        .post("/api/fulfillments/set_method")
        .send({ fulfillment_id: shipmentFulfilment.id, method_id: pickupMethodId });

      assert.equal(res.status, 409, `expected a 409 conflict, got ${res.status}`);
      assert.match(
        String(res.body?.error?.message ?? ""),
        /already has a shipment/,
        "the refusal reached the caller without its reason"
      );
    });
  });
});
