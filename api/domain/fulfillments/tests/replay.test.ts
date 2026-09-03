// The fulfillment endpoints, over real HTTP. get_for_order is the one worth aiming at: requireUser alone plus an order id from the query string is exactly the shape that turned out wrong in five other features - a fulfillment has no user of its own, so "is this yours" is a question about the order.
// The ownership check was written alongside the feature, so this confirms it holds over HTTP rather than closing a hole - tested WITH A STRANGER, since the addresses replay tests passed for weeks over a live hole by only ever sending the caller's own id.
// Admin routes are asserted to refuse a customer rather than exercised: schedule_pickup/schedule_direct write bookings, set_status moves an order's fulfillment.
import { test, afterAll } from "vitest";
import assert from "node:assert/strict";
import request from "supertest";
import pool from "#db";
import { mockSessions, restoreSessions, as, anonymous } from "#shared/testing/session.ts";
import { TEST_ACTOR, TEST_CUSTOMER } from "#shared/testing/actor.ts";
import { inPinnedTransaction, outside } from "#shared/testing/pinned-pool.ts";
import { aUser, anOrder, aShipment } from "#shared/testing/builders/index.ts";
import type { PoolClient } from "pg";
import { LOCKS } from "#shared/testing/locks.ts";

await mockSessions();
const { default: app } = await import("#app");

const FULFILLMENT_LOCK = [LOCKS.ORDERS, LOCKS.FULFILLMENTS];

// The structural subset each fixture actually has - SELECT projections, not table rows.
type UserFixture = { id: string; name: string | null; email: string | null };
type Caller = UserFixture & { role: string };
type OrderFixture = { id: string; user_id: string };

const admin: Caller = { ...TEST_ACTOR, role: "admin" };
const stranger: Caller = { ...TEST_CUSTOMER, role: "user" };

// THE ORDER AND ITS OWNER ARE BUILT (lane 1). This took "the OLDEST order that
// has a fulfillment, so nothing another file creates can move it" - a real
// customer's order, and a fixture whose stability came from being old rather
// than from being ours. A built order cannot be moved by another file at all,
// and the owner is a person who exists only inside this transaction, which is
// what makes "a stranger cannot read somebody else's fulfillment" a claim
// about two people the test names.
//
// Built inside the pin, because that is where the request runs.
const anOwnedOrderWithFulfillment = async (c: PoolClient) => {
  const user = await aUser(c);
  const built = await anOrder(c, user, { direction: "purchase" });
  await aShipment(c, built, { method: "CARRIER DROPOFF" });
  return {
    order: { id: built.id, user_id: user.id },
    owner: { ...user, role: "user" } as Caller,
  };
};

afterAll(async () => {
  restoreSessions();
  await pool.end();
});

test("the method menu is refused to anonymous and filtered by direction", async () => {
  await inPinnedTransaction(async (c: PoolClient) => {
    const { order, owner } = await anOwnedOrderWithFulfillment(c);
    await anonymous(async () => {
      const res = await request(app).get("/api/fulfillments/methods").query({ direction: "purchase" });
      assert.ok([401, 403].includes(res.status), `answered ${res.status}`);
    });

    await as(owner, async () => {
      const res = await request(app)
        .get("/api/fulfillments/methods")
        .query({ direction: "purchase" });
      assert.equal(res.status, 200, JSON.stringify(res.body));
      assert.ok(Array.isArray(res.body) && res.body.length > 0);
      assert.ok(
        res.body.every((m) => m.direction === "purchase" && m.enabled && !m.hidden),
        "the customer menu offered a hidden, disabled, or wrong-direction method"
      );
    });
  }, { actor: TEST_ACTOR.id, lock: FULFILLMENT_LOCK });
});

// The one that matters. A stranger naming somebody else's order must not get
// their pickup address and appointment time.
test("a stranger cannot read the fulfillment of somebody else's order", async () => {
  await inPinnedTransaction(async (c: PoolClient) => {
    const { order, owner } = await anOwnedOrderWithFulfillment(c);
    await as(stranger, async () => {
      const res = await request(app)
        .get("/api/fulfillments/get_for_order")
        .query({ order_id: order.id });
      assert.equal(res.status, 200);
      assert.equal(
        res.body,
        null,
        "a signed-in stranger read somebody else's fulfillment"
      );
    });
  }, { actor: TEST_ACTOR.id, lock: FULFILLMENT_LOCK });
});

test("the order's own customer and an admin can both read it", async () => {
  await inPinnedTransaction(async (c: PoolClient) => {
    const { order, owner } = await anOwnedOrderWithFulfillment(c);
    for (const who of [owner, admin]) {
      await as(who, async () => {
        const res = await request(app)
          .get("/api/fulfillments/get_for_order")
          .query({ order_id: order.id });
        assert.equal(res.status, 200);
        assert.ok(res.body, `${who.role} was refused a fulfillment they may see`);
        assert.equal(res.body.order_id, order.id);
        // The wire is the bare row: method_id, never the method object - the client maps it off GET /fulfillments/methods.
        assert.ok(res.body.method_id, "the row lost its method_id");
        assert.ok(!("method" in res.body), "the method object reached the wire");
      });
    }
  }, { actor: TEST_ACTOR.id, lock: FULFILLMENT_LOCK });
});

// Admin-only, and asserted by refusal rather than by exercising them: these
// write bookings and move an order's state.
test("a customer cannot reach any of the admin fulfillment routes", async () => {
  await inPinnedTransaction(async () => {
    await as(stranger, async () => {
      const calls = [
        ["get", "/api/fulfillments/methods/all", {}],
        ["get", "/api/fulfillments/schedule", {}],
        ["post", "/api/fulfillments/schedule_pickup", { pickup: {} }],
        ["post", "/api/fulfillments/schedule_direct", { direct: {} }],
        ["post", "/api/fulfillments/cancel_schedule", { fulfillment_id: null }],
        ["post", "/api/fulfillments/set_method", { fulfillment_id: null, method_id: null }],
        ["post", "/api/fulfillments/set_status", { fulfillment_id: null, status: "COMPLETED" }],
        ["post", "/api/fulfillments/methods/update", { method: {} }],
      ];
      // Declared as a tuple list - inferred, the element type collapses to a union that `request(app)[verb]` can't index SuperTest with.
      for (const [verb, path, body] of calls as Array<
        ["get" | "post", string, Record<string, unknown>]
      >) {
        const res = await request(app)[verb](path).send(body);
        assert.equal(res.status, 403, `${path} answered ${res.status} to a customer`);
      }
    });
  }, { actor: TEST_ACTOR.id, lock: FULFILLMENT_LOCK });
});

test("nothing this file did survived the transaction", async () => {
  const [{ n }] = await outside(
    `SELECT count(*)::int AS n FROM fulfillments.pickups`
  );
  const [{ d }] = await outside(`SELECT count(*)::int AS d FROM fulfillments.directs`);
  // Both are empty in dev and nothing here books one; a non-zero count means a
  // schedule_pickup or schedule_direct got through a guard and committed.
  assert.equal(n, 0, "a pickup was booked in dev");
  assert.equal(d, 0, "an appointment was booked in dev");
});
