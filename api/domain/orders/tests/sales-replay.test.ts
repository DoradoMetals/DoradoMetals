// The sales-order endpoints, over real HTTP, with the payloads the frontend
// sends.
//
// The purchase-order side of this found that requireUser is not authorization:
// every customer-facing route took its order from the request body and never
// asked whose it was. These ask the same questions of the sales side, because
// a hole found once in one direction is worth looking for in the other.
//
// The mutations live on the unified PATCH /api/orders/:id since the
// namespace ruling - the status label and the supplier send, all admin-only,
// direction-validated as data by features/orders/patch.service.ts. Tracking
// is PATCH /api/shipments/:id: a tracking number is shipment data.
//
// NOTHING IS COMMITTED - the pool is pinned to a rolled-back transaction, and
// the last test proves it from outside.
import test, { after, before } from "node:test";
import assert from "node:assert/strict";
import request from "supertest";
import pool from "#db";
import { mockSessions, restoreSessions, as, anonymous } from "#shared/testing/session.ts";
import {
  inPinnedTransaction,
  assertNothingEscaped,
  outside,
} from "#shared/testing/pinned-pool.ts";
import { LOCKS } from "#shared/testing/locks.ts";

await mockSessions();
const { default: app } = await import("#app");

const ORDER_LOCK = LOCKS.ORDERS;

// THE STRUCTURAL SUBSET EACH FIXTURE ACTUALLY HAS. These are SELECT
// projections, not table rows - naming a row type would claim columns the
// query never asked for.
type UserFixture = { id: string; name: string | null; email: string | null };
type Caller = UserFixture & { role: string };
type SalesOrderFixture = {
  id: string;
  user_id: string;
  status: string | null;
  number: number | null;
};

let admin: Caller;
let owner: Caller;
let stranger: Caller;
let order: SalesOrderFixture;

before(async () => {
  // The OLDEST sales order with an owner. Never the newest: that is a race
  // against every file that creates one, and it made the purchase-order
  // ownership tests intermittent.
  const orders = await outside<SalesOrderFixture>(
    `SELECT id, user_id, sales_order_status AS status, order_number AS number
       FROM exchange.sales_orders
      WHERE user_id IS NOT NULL
      ORDER BY created_at ASC, id ASC LIMIT 1`
  );
  order = orders[0];
  assert.ok(order, "dev has no sales order with an owner");

  const owners = await outside<UserFixture>(`SELECT id, name, email FROM exchange.users WHERE id = $1`, [
    order.user_id,
  ]);
  owner = { ...owners[0], role: "user" };
  assert.ok(owner.id, `no exchange.users row for ${order.user_id}`);

  const admins = await outside<UserFixture>(
    `SELECT id, name, email FROM exchange.users WHERE role = 'admin' LIMIT 1`
  );
  admin = { ...admins[0], role: "admin" };
  assert.ok(admin.id, "dev has no admin user");

  const others = await outside<UserFixture>(
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

test("the list is refused to anonymous, and a customer sees only their own rows", async () => {
  await inPinnedTransaction(async () => {
    await anonymous(async () => {
      const res = await request(app).get("/api/orders?direction=sale");
      assert.ok([401, 403].includes(res.status), `answered ${res.status}`);
    });
    // The unified list is not refused to a customer - it SCOPES: the session's
    // own orders, never the business's. The stranger owns none of the orders
    // the owner does, so none of the owner's rows may appear.
    await as(stranger, async () => {
      const res = await request(app).get("/api/orders?direction=sale");
      assert.equal(res.status, 200, `answered ${res.status}`);
      assert.ok(
        res.body.every((o: { user_id: string }) => o.user_id === stranger.id),
        "a customer's list carried somebody else's sales order"
      );
    });
  }, { lock: ORDER_LOCK });
});

test("the admin list has the fields the drawer destructures", async () => {
  await inPinnedTransaction(async () => {
    await as(admin, async () => {
      const res = await request(app).get("/api/orders?direction=sale");
      assert.equal(res.status, 200);
      assert.ok(Array.isArray(res.body) && res.body.length > 0);

      // THE SLIM WIRE (wave 3) - see the twin in
      // features/orders/tests/purchase-replay.test.ts. One shape for both
      // directions, with `direction` the column that tells them apart.
      const o = res.body[0];
      for (const field of [
        "id", "number", "status", "created_at", "direction", "user_id", "totals",
      ]) {
        assert.ok(field in o, `the admin sales list is missing ${field}`);
      }
      for (const gone of ["order_items", "address", "user", "shipment"]) {
        assert.ok(!(gone in o), `the order wire still carries ${gone}`);
      }
    });
  }, { lock: ORDER_LOCK });
});

// The unified list takes a customer's scope from the SESSION rather than the
// query string - a customer naming another user gets their own orders, the
// subjectOf precedent. Worth an assertion rather than a reading of the
// controller.
test("a customer's own list is scoped to them, whatever they ask for", async () => {
  await inPinnedTransaction(async () => {
    await as(owner, async () => {
      const res = await request(app)
        .get("/api/orders")
        // A user_id that is not theirs. It must be ignored.
        .query({ direction: "sale", user_id: stranger.id });
      assert.equal(res.status, 200);
      assert.ok(
        res.body.every((o: { user_id: string }) => o.user_id === owner.id),
        "asking for somebody else's id returned somebody else's orders"
      );
    });
  }, { lock: ORDER_LOCK });
});

test("a stranger cannot read the spots frozen on somebody else's sales order", async () => {
  await inPinnedTransaction(async () => {
    await as(stranger, async () => {
      // GET /orders/:id/spots replaced the body-keyed legacy route in the
      // read-flip wave; one spots read serves both directions.
      const res = await request(app).get(`/api/orders/${order.id}/spots`);
      assert.equal(res.status, 403, `answered ${res.status} with another customer's spots`);
    });

    await as(owner, async () => {
      const res = await request(app).get(`/api/orders/${order.id}/spots`);
      assert.equal(res.status, 200, "the owner was refused their own order");
      assert.ok(Array.isArray(res.body));
    });
  }, { lock: ORDER_LOCK });
});

test("a customer cannot move a sales order's status or send it to a refiner", async () => {
  await inPinnedTransaction(async () => {
    await as(stranger, async () => {
      const moved = await request(app)
        .patch(`/api/orders/${order.id}`)
        .send({ status: "Completed" });
      assert.equal(moved.status, 403);

      const sent = await request(app)
        .patch(`/api/orders/${order.id}`)
        .send({ supplier: { supplier_id: null, send: true } });
      assert.equal(sent.status, 403, "a customer reached the code that emails a refiner");
    });
  }, { lock: ORDER_LOCK });
});

test("moving a sales order's status takes the document the drawer sends", async () => {
  await inPinnedTransaction(async () => {
    const MOVE_TO = "Preparing";
    assert.notEqual(order.status, MOVE_TO, "the order is already there");

    await as(admin, async () => {
      const res = await request(app)
        .patch(`/api/orders/${order.id}`)
        .send({ status: MOVE_TO });
      assert.equal(res.status, 200, JSON.stringify(res.body));

      const list = await request(app).get("/api/orders?direction=sale");
      const moved = list.body.find((o: { id: string; status: string }) => o.id === order.id);
      assert.equal(moved.status, MOVE_TO);
    });
  }, { lock: ORDER_LOCK });
});

test("no sales order response carries a full bank number", async () => {
  await inPinnedTransaction(async () => {
    await as(admin, async () => {
      const res = await request(app).get("/api/orders?direction=sale");
      const body = JSON.stringify(res.body);
      assert.ok(!/"routing_number"\s*:\s*"\d{9}"/.test(body));

      const [{ n }] = await outside(
        `SELECT count(*)::int AS n FROM exchange.payouts
          WHERE routing_number IS NOT NULL AND length(routing_number) = 9`
      );
      if (n > 0) {
        const [{ leaked }] = await outside(
          `SELECT count(*)::int AS leaked FROM exchange.payouts
            WHERE routing_number IS NOT NULL AND position(routing_number in $1) > 0`,
          [body]
        );
        assert.equal(leaked, 0, "a real routing number appears in a sales order response");
      }
    });
  }, { lock: ORDER_LOCK });
});

test("nothing this file did survived the transaction", async () => {
  const [{ status }] = await outside(
    `SELECT sales_order_status AS status FROM exchange.sales_orders WHERE id = $1`,
    [order.id]
  );
  assert.equal(
    status,
    order.status,
    "a sales order was really moved in dev"
  );
});
