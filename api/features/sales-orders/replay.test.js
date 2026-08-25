// The sales-order endpoints, over real HTTP, with the payloads the frontend
// sends.
//
// The purchase-order side of this found that requireUser is not authorization:
// every customer-facing route took its order from the request body and never
// asked whose it was. These ask the same questions of the sales side, because
// a hole found once in one direction is worth looking for in the other.
//
// NOTHING IS COMMITTED - the pool is pinned to a rolled-back transaction, and
// the last test proves it from outside.
import test, { after, before } from "node:test";
import assert from "node:assert/strict";
import request from "supertest";
import pool from "#db";
import { mockSessions, restoreSessions, as, anonymous } from "#shared/testing/session.js";
import {
  inPinnedTransaction,
  assertNothingEscaped,
  outside,
} from "#shared/testing/pinned-pool.js";
import { LOCKS } from "#shared/testing/locks.js";

await mockSessions();
const { default: app } = await import("#app");

const ORDER_LOCK = LOCKS.ORDERS;

let admin;
let owner;
let stranger;
let order;

before(async () => {
  // The OLDEST sales order with an owner. Never the newest: that is a race
  // against every file that creates one, and it made the purchase-order
  // ownership tests intermittent.
  const orders = await outside(
    `SELECT id, user_id, sales_order_status, order_number
       FROM exchange.sales_orders
      WHERE user_id IS NOT NULL
      ORDER BY created_at ASC, id ASC LIMIT 1`
  );
  order = orders[0];
  assert.ok(order, "dev has no sales order with an owner");

  const owners = await outside(`SELECT id, name, email FROM exchange.users WHERE id = $1`, [
    order.user_id,
  ]);
  owner = { ...owners[0], role: "user" };
  assert.ok(owner.id, `no exchange.users row for ${order.user_id}`);

  const admins = await outside(
    `SELECT id, name, email FROM exchange.users WHERE role = 'admin' LIMIT 1`
  );
  admin = { ...admins[0], role: "admin" };
  assert.ok(admin.id, "dev has no admin user");

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

test("the admin list is refused to anonymous and to a customer", async () => {
  await inPinnedTransaction(async () => {
    await anonymous(async () => {
      const res = await request(app).get("/api/sales_orders/get_all");
      assert.ok([401, 403].includes(res.status), `answered ${res.status}`);
    });
    await as(stranger, async () => {
      const res = await request(app).get("/api/sales_orders/get_all");
      assert.equal(res.status, 403, "a customer reached every sales order in the business");
    });
  }, { lock: ORDER_LOCK });
});

test("the admin list has the fields the drawer destructures", async () => {
  await inPinnedTransaction(async () => {
    await as(admin, async () => {
      const res = await request(app).get("/api/sales_orders/get_all");
      assert.equal(res.status, 200);
      assert.ok(Array.isArray(res.body) && res.body.length > 0);

      const o = res.body[0];
      for (const field of [
        "id", "order_number", "sales_order_status", "created_at",
        "order_items", "address", "user", "order_total", "shipment",
      ]) {
        assert.ok(field in o, `the admin sales list is missing ${field}`);
      }
      assert.ok(Array.isArray(o.order_items));
    });
  }, { lock: ORDER_LOCK });
});

// getSalesOrders takes the user from the SESSION rather than the query string,
// which is what the purchase-order side got wrong elsewhere. Worth an assertion
// rather than a reading of the controller.
test("a customer's own list is scoped to them, whatever they ask for", async () => {
  await inPinnedTransaction(async () => {
    await as(owner, async () => {
      const res = await request(app)
        .get("/api/sales_orders/get_sales_orders")
        // A user_id that is not theirs. It must be ignored.
        .query({ user_id: stranger.id });
      assert.equal(res.status, 200);
      assert.ok(
        res.body.every((o) => o.user_id === owner.id),
        "asking for somebody else's id returned somebody else's orders"
      );
    });
  }, { lock: ORDER_LOCK });
});

test("a stranger cannot read the spots frozen on somebody else's sales order", async () => {
  await inPinnedTransaction(async () => {
    await as(stranger, async () => {
      const res = await request(app)
        .post("/api/sales_orders/get_order_metals")
        .send({ sales_order_id: order.id });
      assert.equal(res.status, 403, `answered ${res.status} with another customer's spots`);
    });

    await as(owner, async () => {
      const res = await request(app)
        .post("/api/sales_orders/get_order_metals")
        .send({ sales_order_id: order.id });
      assert.equal(res.status, 200, "the owner was refused their own order");
      assert.ok(Array.isArray(res.body));
    });
  }, { lock: ORDER_LOCK });
});

test("a customer cannot move a sales order's status or send it to a refiner", async () => {
  await inPinnedTransaction(async () => {
    await as(stranger, async () => {
      const moved = await request(app)
        .post("/api/sales_orders/update_status")
        .send({ order_status: "Completed", order, user_name: stranger.name });
      assert.equal(moved.status, 403);

      const sent = await request(app)
        .post("/api/sales_orders/send_order_to_supplier")
        .send({ order, spots: [], supplier_id: null });
      assert.equal(sent.status, 403, "a customer reached the code that emails a refiner");
    });
  }, { lock: ORDER_LOCK });
});

test("moving a sales order's status takes the body the drawer sends", async () => {
  await inPinnedTransaction(async () => {
    const MOVE_TO = "Preparing";
    assert.notEqual(order.sales_order_status, MOVE_TO, "the order is already there");

    await as(admin, async () => {
      const res = await request(app)
        .post("/api/sales_orders/update_status")
        .send({ order_status: MOVE_TO, order, user_name: admin.name });
      assert.equal(res.status, 200, JSON.stringify(res.body));

      const list = await request(app).get("/api/sales_orders/get_all");
      const moved = list.body.find((o) => o.id === order.id);
      assert.equal(moved.sales_order_status, MOVE_TO);
    });
  }, { lock: ORDER_LOCK });
});

test("no sales order response carries a full bank number", async () => {
  await inPinnedTransaction(async () => {
    await as(admin, async () => {
      const res = await request(app).get("/api/sales_orders/get_all");
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
    order.sales_order_status,
    "a sales order was really moved in dev"
  );
});
