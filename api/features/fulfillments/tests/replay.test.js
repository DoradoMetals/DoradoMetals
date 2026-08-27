// The fulfillment endpoints, over real HTTP.
//
// get_for_order is the one worth aiming at: it is requireUser and takes an
// order id from the query string. A fulfillment carries no user of its own - it
// belongs to an order and the order belongs to somebody - so "is this yours" is
// a question about the order, and that is exactly the shape that turned out to
// be wrong in five other features.
//
// The ownership check here was written at the same time as the feature rather
// than discovered later, so this file is confirming it holds over HTTP rather
// than closing a hole. WITH A STRANGER, because the addresses replay tests
// passed for weeks over a live hole by only ever sending the caller's own id.
//
// The admin routes are asserted to refuse a customer rather than exercised:
// schedule_pickup and schedule_direct write bookings, and set_status moves an
// order's fulfillment.
import test, { after, before } from "node:test";
import assert from "node:assert/strict";
import request from "supertest";
import pool from "#db";
import { mockSessions, restoreSessions, as, anonymous } from "#shared/testing/session.ts";
import { inPinnedTransaction, outside } from "#shared/testing/pinned-pool.ts";
import { LOCKS } from "#shared/testing/locks.ts";

await mockSessions();
const { default: app } = await import("#app");

const FULFILLMENT_LOCK = [LOCKS.ORDERS, LOCKS.FULFILLMENTS];

let admin;
let owner;
let stranger;
let order;

before(async () => {
  // The OLDEST order that has a fulfillment, so nothing another file creates
  // can move it.
  const orders = await outside(
    `SELECT o.id, o.user_id
       FROM orders.orders o
       JOIN fulfillments.fulfillments f ON f.order_id = o.id
      WHERE o.user_id IS NOT NULL
      ORDER BY o.created_at ASC, o.id ASC
      LIMIT 1`
  );
  order = orders[0];
  assert.ok(order, "dev has no owned order with a fulfillment");

  const owners = await outside(`SELECT id, name, email FROM exchange.users WHERE id = $1`, [
    order.user_id,
  ]);
  owner = { ...owners[0], role: "user" };
  assert.ok(owner.id, `no exchange.users row for ${order.user_id}`);

  const admins = await outside(
    `SELECT id, name, email FROM exchange.users WHERE role = 'admin' LIMIT 1`
  );
  admin = { ...admins[0], role: "admin" };
  assert.ok(admin.id, "dev has no admin");

  const others = await outside(
    `SELECT id, name, email FROM exchange.users
      WHERE id <> $1 AND role IS DISTINCT FROM 'admin' LIMIT 1`,
    [order.user_id]
  );
  stranger = { ...others[0], role: "user" };
  assert.ok(stranger.id, "dev has only one non-admin user");
});

after(async () => {
  restoreSessions();
  await pool.end();
});

test("the method menu is refused to anonymous and filtered by direction", async () => {
  await inPinnedTransaction(async () => {
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
  }, { lock: FULFILLMENT_LOCK });
});

// The one that matters. A stranger naming somebody else's order must not get
// their pickup address and appointment time.
test("a stranger cannot read the fulfillment of somebody else's order", async () => {
  await inPinnedTransaction(async () => {
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
  }, { lock: FULFILLMENT_LOCK });
});

test("the order's own customer and an admin can both read it", async () => {
  await inPinnedTransaction(async () => {
    for (const who of [owner, admin]) {
      await as(who, async () => {
        const res = await request(app)
          .get("/api/fulfillments/get_for_order")
          .query({ order_id: order.id });
        assert.equal(res.status, 200);
        assert.ok(res.body, `${who.role} was refused a fulfillment they may see`);
        assert.equal(res.body.order_id, order.id);
        assert.ok(res.body.method, "the method did not come back nested");
      });
    }
  }, { lock: FULFILLMENT_LOCK });
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
      for (const [verb, path, body] of calls) {
        const res = await request(app)[verb](path).send(body);
        assert.equal(res.status, 403, `${path} answered ${res.status} to a customer`);
      }
    });
  }, { lock: FULFILLMENT_LOCK });
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
