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
import { test, afterAll } from "vitest";
import assert from "node:assert/strict";
import request from "supertest";
import pool from "#db";
import { mockSessions, restoreSessions, as, anonymous } from "#shared/testing/session.ts";
import { TEST_ACTOR, TEST_CUSTOMER } from "#shared/testing/actor.ts";
import { aUser, aProduct, anOrder } from "#shared/testing/builders/index.ts";
import type { PoolClient } from "pg";
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

const admin: Caller = { ...TEST_ACTOR, role: "admin" };
const stranger: Caller = { ...TEST_CUSTOMER, role: "user" };

// THE SALES ORDER AND ITS OWNER ARE BUILT (lane 1). The fixture used to be
// "the OLDEST sales order with an owner. Never the newest: that is a race
// against every file that creates one" - chosen for immovability rather than
// ownership - and it read `exchange.sales_orders`, which D212 froze, while
// every endpoint under test reads `orders.orders`.
const aSalesOrder = async (c: PoolClient) => {
  const owner = await aUser(c, { name: "The Buyer" });
  const product = await aProduct(c);
  const built = await anOrder(c, owner, { direction: "sale", status: "Pending" })
    .withBullion(product, 2, { price: 2600 })
    .withTotals({ total: 5200, items: 5200 });
  return {
    order: { id: built.id, user_id: owner.id, status: built.status, number: built.number },
    owner: { ...owner, role: "user" } as Caller,
  };
};

afterAll(async () => {
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
  }, { actor: TEST_ACTOR.id, lock: ORDER_LOCK });
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
  }, { actor: TEST_ACTOR.id, lock: ORDER_LOCK });
});

// The unified list takes a customer's scope from the SESSION rather than the
// query string - a customer naming another user gets their own orders, the
// subjectOf precedent. Worth an assertion rather than a reading of the
// controller.
test("a customer's own list is scoped to them, whatever they ask for", async () => {
  await inPinnedTransaction(async (c: PoolClient) => {
    const { owner } = await aSalesOrder(c);
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
  }, { actor: TEST_ACTOR.id, lock: ORDER_LOCK });
});

test("a stranger cannot read the spots frozen on somebody else's sales order", async () => {
  await inPinnedTransaction(async (c: PoolClient) => {
    const { order, owner } = await aSalesOrder(c);
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
  }, { actor: TEST_ACTOR.id, lock: ORDER_LOCK });
});

test("a customer cannot move a sales order's status or send it to a refiner", async () => {
  await inPinnedTransaction(async (c: PoolClient) => {
    const { order } = await aSalesOrder(c);
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
  }, { actor: TEST_ACTOR.id, lock: ORDER_LOCK });
});

test("moving a sales order's status takes the document the drawer sends", async () => {
  await inPinnedTransaction(async (c: PoolClient) => {
    const { order } = await aSalesOrder(c);
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
  }, { actor: TEST_ACTOR.id, lock: ORDER_LOCK });
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
  }, { actor: TEST_ACTOR.id, lock: ORDER_LOCK });
});

// THE FIXTURE IS BUILT INSIDE EACH TRANSACTION NOW, so there is no committed
// order for this file to have moved - which is a stronger statement than the
// one this test used to make (re-reading the discovered order and asking
// whether its status had drifted). What the pin holds is asserted directly, on
// a built order, in shared/testing/builders/tests/builders.test.ts.
test("no built sales order survived the transaction", async () => {
  let built = "";
  await inPinnedTransaction(async (c: PoolClient) => {
    built = (await aSalesOrder(c)).order.id;
  }, { actor: TEST_ACTOR.id, lock: ORDER_LOCK });

  const rows = await outside(`SELECT id FROM orders.orders WHERE id = $1`, [built]);
  assert.equal(rows.length, 0, "a built sales order was committed to the database");
});
