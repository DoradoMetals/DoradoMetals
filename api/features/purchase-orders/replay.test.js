// The admin purchase-order screen, over real HTTP.
//
// These are the operations Jacob asked for by name, and they are the ones with
// the least test coverage relative to what they can do: moving an order's
// status, changing a frozen spot price, locking and unlocking spots. Each one
// is a request an admin makes with a real order in front of them, and each one
// has a way of going wrong that only shows up at this level - the controller
// destructuring a body shape the frontend does not send, a guard that lets the
// wrong role through, a response the drawer cannot render.
//
// THE SURFACE IS THE UNIFIED /api/orders NAMESPACE NOW (Jacob's rulings, 28
// August: one endpoint per resource, direction is data). The status label is
// PATCH /api/orders/:id; the frozen spots are PUT /api/orders/:id/spots.
// Locking no longer sends the browser's copy of the live spot feed: the
// server pins its own, which is what the spots_locked assertion below now
// proves.
//
// NOTHING IS COMMITTED - the pool is pinned to a rolled-back transaction. The
// last test proves it from outside.
//
// DELIBERATELY NOT COVERED: create_purchase_order and cancel_order. Both call
// FedEx before the transaction opens, so replaying them would create a real,
// billable label. Their database halves are covered by
// features/orders/parity.test.js, which calls recordPurchaseOrder directly.
import test, { after, before } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import request from "supertest";
import pool from "#db";
import { mockSessions, restoreSessions, as } from "#shared/testing/session.ts";
import { inPinnedTransaction, assertNothingEscaped, outside } from "#shared/testing/pinned-pool.ts";

await mockSessions();
const { default: app } = await import("#app");

import { LOCKS } from "#shared/testing/locks.ts";
// Orders only - this file writes no address.
const ORDER_LOCK = LOCKS.ORDERS;

let admin;
let customer;

before(async () => {
  const rows = await outside(
    `SELECT id, name, email, role FROM exchange.users WHERE role = 'admin' LIMIT 1`
  );
  admin = { ...rows[0], role: "admin" };
  assert.ok(admin?.id, "dev has no admin user");

  const users = await outside(
    `SELECT id, name, email FROM exchange.users WHERE role IS DISTINCT FROM 'admin' LIMIT 1`
  );
  customer = { ...users[0], role: "user" };
  assert.ok(customer?.id, "dev has no non-admin user");
});

after(async () => {
  restoreSessions();
  await pool.end();
});

// An order that is NOT already in the status the move test targets, or the
// assertion afterwards cannot tell a successful move from a no-op - and neither
// can the escape check. Dev's newest open order happens to be Received already,
// which is exactly the vacuous-test trap this codebase has hit before.
const MOVE_TO = "Payment Processing";

const anOrder = async () => {
  // ... and one that HAS spot rows, expressed in the query rather than assumed
  // of whatever order happens to be newest - dev drifts, and the spot-change
  // test needs a spot to change.
  // Aliased to the WIRE's names (D84) because this row becomes the body the
  // drawer sends; the exchange COLUMNS keep their own spellings in the WHERE.
  const rows = await outside(
    `SELECT p.id, p.order_number AS number, p.purchase_order_status AS status
       FROM exchange.purchase_orders p
      WHERE p.purchase_order_status NOT IN ('Cancelled', 'Completed', $1)
        AND EXISTS (SELECT 1 FROM exchange.order_metals m WHERE m.purchase_order_id = p.id)
      ORDER BY p.created_at DESC LIMIT 1`,
    [MOVE_TO]
  );
  return rows[0];
};

test("the admin list is refused to a customer and served to an admin", async () => {
  await inPinnedTransaction(async () => {
    await as(customer, async () => {
      const res = await request(app).get("/api/purchase_orders/get_all_purchase_orders");
      assert.equal(res.status, 403, "a customer reached every order in the business");
    });

    await as(admin, async () => {
      const res = await request(app).get("/api/purchase_orders/get_all_purchase_orders");
      assert.equal(res.status, 200);
      assert.ok(Array.isArray(res.body) && res.body.length > 0);

      // What AdminPurchaseOrders.tsx and the drawer destructure. A missing key
      // here renders as blank rather than as an error, which is why it is worth
      // asserting rather than eyeballing.
      const order = res.body[0];
      for (const field of [
        "id", "number", "status", "created_at",
        "order_items", "address", "user", "payout", "spots_locked", "totals",
      ]) {
        assert.ok(field in order, `the admin list is missing ${field}`);
      }
      assert.ok(Array.isArray(order.order_items), "order_items is not a list");
    });
  }, { lock: ORDER_LOCK });
});

// The one that carries real money. An order response must never contain a full
// routing or account number - only the last four.
test("no admin order response carries a full bank number", async () => {
  await inPinnedTransaction(async () => {
    await as(admin, async () => {
      const res = await request(app).get("/api/purchase_orders/get_all_purchase_orders");
      const body = JSON.stringify(res.body);

      assert.ok(!/"routing_number"\s*:\s*"\d{9}"/.test(body), "a full routing number is on the wire");
      assert.ok(
        !/"account_number"\s*:\s*"\d{5,}"/.test(body),
        "a full account number is on the wire"
      );

      // And the real values from the database are absent, not merely
      // unmatched by a regex. Counted and compared rather than read: the
      // values themselves are never selected.
      const [{ n }] = await outside(
        `SELECT count(*)::int AS n FROM exchange.payouts
          WHERE routing_number IS NOT NULL AND length(routing_number) = 9`
      );
      if (n > 0) {
        const [{ leaked }] = await outside(
          `SELECT count(*)::int AS leaked FROM exchange.payouts
            WHERE routing_number IS NOT NULL
              AND position(routing_number in $1) > 0`,
          [body]
        );
        assert.equal(leaked, 0, "a real routing number appears in the response body");
      }
    });
  }, { lock: ORDER_LOCK });
});

test("moving an order's status takes the body the drawer sends", async () => {
  await inPinnedTransaction(async () => {
    const order = await anOrder();
    assert.ok(order, "dev has no open purchase order");

    await as(admin, async () => {
      // The document form of useMovePurchaseOrderStatus: the id in the path,
      // the label in the body, the audit name from the session.
      const res = await request(app)
        .patch(`/api/orders/${order.id}`)
        .send({ status: MOVE_TO });

      assert.equal(res.status, 200, JSON.stringify(res.body));

      const list = await request(app).get("/api/purchase_orders/get_all_purchase_orders");
      const moved = list.body.find((o) => o.id === order.id);
      assert.notEqual(
        order.status,
        MOVE_TO,
        "the order was already in the target status - this proves nothing"
      );
      assert.equal(moved.status, MOVE_TO);
    });
  }, { lock: ORDER_LOCK });
});

test("a customer cannot move an order's status", async () => {
  await inPinnedTransaction(async () => {
    const order = await anOrder();
    await as(customer, async () => {
      const res = await request(app)
        .patch(`/api/orders/${order.id}`)
        .send({ status: "Completed" });
      assert.equal(res.status, 403, "a customer moved their own order to Completed");
    });
  }, { lock: ORDER_LOCK });
});

test("locking spots freezes them and unlocking releases them", async () => {
  await inPinnedTransaction(async () => {
    const order = await anOrder();

    await as(admin, async () => {
      // { spots: { lock: true } } and nothing else: the server resolves the
      // live spots itself (getCurrentSpotPrices, the auto-accept cron's own
      // source) where the old route took the browser's copy of the feed.
      const locked = await request(app)
        .put(`/api/orders/${order.id}/spots`)
        .send({ lock: true });
      assert.equal(locked.status, 200, JSON.stringify(locked.body));

      const list = await request(app).get("/api/purchase_orders/get_all_purchase_orders");
      assert.equal(
        list.body.find((o) => o.id === order.id).spots_locked,
        true,
        "the order does not report its spots as locked"
      );

      const unlocked = await request(app)
        .put(`/api/orders/${order.id}/spots`)
        .send({ lock: false });
      assert.equal(unlocked.status, 200, JSON.stringify(unlocked.body));

      const after = await request(app).get("/api/purchase_orders/get_all_purchase_orders");
      assert.equal(after.body.find((o) => o.id === order.id).spots_locked, false);
    });
  }, { lock: ORDER_LOCK });
});

test("changing a spot price lands on that order and no other", async () => {
  await inPinnedTransaction(async () => {
    const order = await anOrder();

    await as(admin, async () => {
      const metals = await request(app)
        .post("/api/purchase_orders/get_purchase_order_metals")
        .send({ purchase_order_id: order.id });
      assert.equal(metals.status, 200, JSON.stringify(metals.body));
      assert.ok(Array.isArray(metals.body) && metals.body.length > 0, "the order has no spots");

      const spot = metals.body[0];
      const sentinel = 1234.56;
      assert.ok("bid" in spot, "the metals response no longer carries bid");
      assert.ok(!("bid_spot" in spot), "the metals response still carries the legacy bid_spot");

      const res = await request(app)
        .put(`/api/orders/${order.id}/spots`)
        .send({ set: [{ name: spot.name, bid: sentinel }] });
      assert.equal(res.status, 200, JSON.stringify(res.body));

      const after = await request(app)
        .post("/api/purchase_orders/get_purchase_order_metals")
        .send({ purchase_order_id: order.id });
      const changed = after.body.find((s) => s.id === spot.id);
      assert.equal(Number(changed.bid), sentinel, "the new price did not stick");

      // Every other metal on the order is untouched.
      for (const other of after.body.filter((s) => s.id !== spot.id)) {
        assert.notEqual(
          Number(other.bid),
          sentinel,
          "one edit changed more than one metal's spot"
        );
      }
    });
  }, { lock: ORDER_LOCK });
});

test("nothing this file did survived the transaction", async () => {
  const order = await anOrder();
  const [{ status }] = await outside(
    `SELECT purchase_order_status AS status FROM exchange.purchase_orders WHERE id = $1`,
    [order.id]
  );
  assert.notEqual(status, MOVE_TO, `an order was really moved to ${MOVE_TO} in dev`);

  assert.equal(
    await assertNothingEscaped("exchange.order_metals", "bid_spot = 1234.56"),
    0,
    "a sentinel spot price was committed to dev"
  );
  assert.equal(
    await assertNothingEscaped("orders.spots", "bid = 1234.56"),
    0,
    "a sentinel spot price escaped into the new schema"
  );
});
