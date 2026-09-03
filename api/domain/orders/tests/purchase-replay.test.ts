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
import { test, afterAll } from "vitest";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import request from "supertest";
import pool from "#db";
import { mockSessions, restoreSessions, as } from "#shared/testing/session.ts";
import { TEST_ACTOR, TEST_CUSTOMER } from "#shared/testing/actor.ts";
import { aUser, anOrder } from "#shared/testing/builders/index.ts";
import type { PoolClient } from "pg";
import { inPinnedTransaction, assertNothingEscaped, outside } from "#shared/testing/pinned-pool.ts";

await mockSessions();
const { default: app } = await import("#app");

import { LOCKS } from "#shared/testing/locks.ts";
// Orders only - this file writes no address.
const ORDER_LOCK = LOCKS.ORDERS;

// THE STRUCTURAL SUBSET EACH FIXTURE ACTUALLY HAS. These are SELECT
// projections, not table rows - naming a row type would claim columns the
// query never asked for.
type UserFixture = { id: string; name: string | null; email: string | null };
type Caller = UserFixture & { role: string };

const admin: Caller = { ...TEST_ACTOR, role: "admin" };
const customer: Caller = { ...TEST_CUSTOMER, role: "user" };

afterAll(async () => {
  restoreSessions();
  await pool.end();
});

// An order that is NOT already in the status the move test targets, or the
// assertion afterwards cannot tell a successful move from a no-op - and neither
// can the escape check. Dev's newest open order happens to be Received already,
// which is exactly the vacuous-test trap this codebase has hit before.
const MOVE_TO = "Payment Processing";

// THE ORDER IS BUILT (lane 1), and it was read out of FROZEN TABLES: the WHERE
// walked `exchange.purchase_orders` and `exchange.order_metals`, which D212
// stopped writing, while the endpoints under test read `orders.orders` and
// `orders.spots`. The fixture and the subject had drifted apart.
//
// The two conditions the old query expressed stay, as arguments: the order is
// NOT already in MOVE_TO (or a successful move is indistinguishable from a
// no-op), and it HAS spot rows (the spot-change test needs one to change).
const aBuiltOrder = async (c: PoolClient) => {
  const owner = await aUser(c);
  const order = await anOrder(c, owner, { direction: "purchase", status: "Pending" })
    .withLots(1, { metal: "Gold" })
    .withLots(1, { metal: "Silver" })
    .withSpots()
    .withTotals({ total: 1000 });
  assert.notEqual(order.status, MOVE_TO, "the fixture starts in the target status");
  return { id: order.id, number: order.number, status: order.status, user_id: owner.id };
};

test("a customer sees only their own rows, and the admin list is served whole", async () => {
  await inPinnedTransaction(async () => {
    // The unified list is not refused to a customer - it SCOPES: the
    // session's own orders, never the business's.
    await as(customer, async () => {
      const res = await request(app).get("/api/orders?direction=purchase");
      assert.equal(res.status, 200, `answered ${res.status}`);
      assert.ok(
        res.body.every((o: { user_id: string }) => o.user_id === customer.id),
        "a customer's list carried somebody else's purchase order"
      );
    });

    await as(admin, async () => {
      const res = await request(app).get("/api/orders?direction=purchase");
      assert.equal(res.status, 200);
      assert.ok(Array.isArray(res.body) && res.body.length > 0);

      // THE SLIM WIRE (wave 3): the orders.orders row plus `totals`, and
      // nothing else. order_items, address, user and payout left this
      // response - each is its own parent-path read, checked by
      // validate:wire - so what is asserted here is the row, and that the
      // slots have genuinely GONE rather than gone quietly nullable.
      const order = res.body[0];
      for (const field of [
        "id", "number", "status", "created_at", "direction", "user_id",
        "spots_locked", "totals",
      ]) {
        assert.ok(field in order, `the admin list is missing ${field}`);
      }
      for (const gone of ["order_items", "address", "user", "payout", "shipment"]) {
        assert.ok(!(gone in order), `the order wire still carries ${gone}`);
      }
    });
  }, { actor: TEST_ACTOR.id, lock: ORDER_LOCK });
});

// The one that carries real money. An order response must never contain a full
// routing or account number - only the last four.
test("no admin order response carries a full bank number", async () => {
  await inPinnedTransaction(async () => {
    await as(admin, async () => {
      const res = await request(app).get("/api/orders?direction=purchase");
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
  }, { actor: TEST_ACTOR.id, lock: ORDER_LOCK });
});

test("moving an order's status takes the body the drawer sends", async () => {
  await inPinnedTransaction(async (c: PoolClient) => {
    const order = await aBuiltOrder(c);

    await as(admin, async () => {
      // The document form of useMovePurchaseOrderStatus: the id in the path,
      // the label in the body, the audit name from the session.
      const res = await request(app)
        .patch(`/api/orders/${order.id}`)
        .send({ status: MOVE_TO });

      assert.equal(res.status, 200, JSON.stringify(res.body));

      const list = await request(app).get("/api/orders?direction=purchase");
      const moved = list.body.find((o: { id: string; status: string }) => o.id === order.id);
      assert.notEqual(
        order.status,
        MOVE_TO,
        "the order was already in the target status - this proves nothing"
      );
      assert.equal(moved.status, MOVE_TO);
    });
  }, { actor: TEST_ACTOR.id, lock: ORDER_LOCK });
});

test("a customer cannot move an order's status", async () => {
  await inPinnedTransaction(async (c: PoolClient) => {
    const order = await aBuiltOrder(c);
    await as(customer, async () => {
      const res = await request(app)
        .patch(`/api/orders/${order.id}`)
        .send({ status: "Completed" });
      assert.equal(res.status, 403, "a customer moved their own order to Completed");
    });
  }, { actor: TEST_ACTOR.id, lock: ORDER_LOCK });
});

test("locking spots freezes them and unlocking releases them", async () => {
  await inPinnedTransaction(async (c: PoolClient) => {
    const order = await aBuiltOrder(c);

    await as(admin, async () => {
      // { spots: { lock: true } } and nothing else: the server resolves the
      // live spots itself (getCurrentSpotPrices, the auto-accept cron's own
      // source) where the old route took the browser's copy of the feed.
      const locked = await request(app)
        .put(`/api/orders/${order.id}/spots`)
        .send({ lock: true });
      assert.equal(locked.status, 200, JSON.stringify(locked.body));

      const list = await request(app).get("/api/orders?direction=purchase");
      assert.equal(
        list.body.find((o: { id: string; status: string }) => o.id === order.id).spots_locked,
        true,
        "the order does not report its spots as locked"
      );

      const unlocked = await request(app)
        .put(`/api/orders/${order.id}/spots`)
        .send({ lock: false });
      assert.equal(unlocked.status, 200, JSON.stringify(unlocked.body));

      const after = await request(app).get("/api/orders?direction=purchase");
      // GUARDED: this dereferenced find() straight through, so an order
      // missing from the list produced a TypeError rather than saying the
      // order was missing. Surfaced by the TypeScript conversion.
      const listed = after.body.find((o: { id: string; spots_locked: boolean }) => o.id === order.id);
      assert.ok(listed, `order ${order.id} is absent from the list after unlocking`);
      assert.equal(listed.spots_locked, false);
    });
  }, { actor: TEST_ACTOR.id, lock: ORDER_LOCK });
});

test("changing a spot price lands on that order and no other", async () => {
  await inPinnedTransaction(async (c: PoolClient) => {
    const order = await aBuiltOrder(c);

    await as(admin, async () => {
      const metals = await request(app).get(`/api/orders/${order.id}/spots`);
      assert.equal(metals.status, 200, JSON.stringify(metals.body));
      assert.ok(Array.isArray(metals.body) && metals.body.length > 0, "the order has no spots");

      const spot = metals.body[0];
      const sentinel = 1234.56;
      assert.ok("bid" in spot, "the metals response no longer carries bid");
      assert.ok(!("bid_spot" in spot), "the metals response still carries the legacy bid_spot");
      // VERBATIM rows (ruling 12): the read serves metal_id, never a joined
      // name - and the PUT speaks the same id (D214 item 11), where it used to
      // take the metal's display NAME and resolve it against metals.metals.
      assert.ok(!("name" in spot), "the spots read is smearing a joined name onto the row");

      const res = await request(app)
        .put(`/api/orders/${order.id}/spots`)
        .send({ set: [{ metal_id: spot.metal_id, bid: sentinel }] });
      assert.equal(res.status, 200, JSON.stringify(res.body));

      const after = await request(app).get(`/api/orders/${order.id}/spots`);
      const changed = after.body.find((s: { id: string; bid: string }) => s.id === spot.id);
      assert.equal(Number(changed.bid), sentinel, "the new price did not stick");

      // Every other metal on the order is untouched.
      for (const other of after.body.filter((s: { id: string; bid: string }) => s.id !== spot.id)) {
        assert.notEqual(
          Number(other.bid),
          sentinel,
          "one edit changed more than one metal's spot"
        );
      }
    });
  }, { actor: TEST_ACTOR.id, lock: ORDER_LOCK });
});

test("nothing this file did survived the transaction", async () => {
  // THE ORDER CHECK IS GONE AND ITS ABSENCE IS STRONGER: the fixture is built
  // inside each transaction now, so there is no committed order for this file
  // to have moved - where before it re-ran the discovery query and asked
  // whether THAT order had drifted. The exchange.order_metals sentinel check
  // goes with it: D212 stopped writing that table, so a sentinel could not
  // have reached it either way.
  assert.equal(
    await assertNothingEscaped("orders.spots", "bid = 1234.56"),
    0,
    "a sentinel spot price escaped into the new schema"
  );
});
