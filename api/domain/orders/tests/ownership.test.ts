// Whether an order's own customer is the only customer who can act on it.
//
// Every customer-facing purchase-order route takes the order out of the request
// BODY - `const { order } = req.body` - and none of them consults req.user. The
// guard is requireUser, which asks whether somebody is signed in and nothing
// about who. So the question these ask is: can customer B accept, reject,
// annotate or CANCEL customer A's order.
//
// cancel_order is the one that costs money. It generates a return label and
// ships the metal back, so a wrongly-cancelled order is a real FedEx charge and
// a customer's gold in the post.
//
// Order ids are uuids rather than sequential, so this is not a hole anyone
// stumbles into. It is still the difference between "you cannot" and "you
// probably will not guess".
import { test, afterAll } from "vitest";
import assert from "node:assert/strict";
import request from "supertest";
import pool from "#db";
import { mockSessions, restoreSessions, as, asAdmin } from "#shared/testing/session.ts";
import { TEST_ACTOR } from "#shared/testing/actor.ts";
import { inPinnedTransaction } from "#shared/testing/pinned-pool.ts";
import { aUser, anOrder } from "#shared/testing/builders/index.ts";
import type { PoolClient } from "pg";

await mockSessions();
const { default: app } = await import("#app");

import { LOCKS } from "#shared/testing/locks.ts";
// Orders only - this file writes no address.
const ORDER_LOCK = LOCKS.ORDERS;

// THE STRUCTURAL SUBSET EACH FIXTURE ACTUALLY HAS. These are SELECT
// projections, not table rows - naming a row type would claim columns the
// query never asked for.
type UserFixture = { id: string; name: string | null; email: string | null };
type OrderFixture = {
  id: string;
  user_id: string;
  purchase_order_status: string;
  order_number: number;
};

// THE ORDER AND ITS THREE PEOPLE ARE BUILT (lane 1), and this file's own
// deleted `beforeAll` is the best argument in the suite for why.
//
// It picked "the OLDEST open order, not the newest, and that is the whole
// point": the newest was a race against every other file that creates one -
// another suite's uncommitted order was visible when beforeAll ran and gone by
// the time the request was made - so the fixture was chosen for being too old
// to move. It then asserted that the order was STILL THERE after choosing it,
// looked its owner up in exchange.users and asserted that row existed too, and
// hunted a second non-admin to be the stranger. Six guards, all of them
// describing the same defect: the test did not own its fixture.
//
// It also read `exchange.purchase_orders`, which D212 froze - so the fixture
// was drawn from a table nothing writes any more while the guards under test
// read `orders.orders`.
//
// Built inside the pin, which is where the requests run. Nothing else can move
// it, and the two people are two people by construction.
const world = async (c: PoolClient) => {
  const victimUser = await aUser(c, { name: "The Owner" });
  const strangerUser = await aUser(c, { name: "The Stranger" });
  const order = await anOrder(c, victimUser, { direction: "purchase", status: "Pending" })
    .withLots(1)
    .withSpots();
  return {
    victim: { ...victimUser, role: "user" },
    stranger: { ...strangerUser, role: "user" },
    order: { id: order.id, user_id: victimUser.id },
  };
};

afterAll(async () => {
  restoreSessions();
  await pool.end();
});

test("a stranger cannot read the spots frozen on somebody else's order", async () => {
  await inPinnedTransaction(async (c: PoolClient) => {
    const { stranger, order } = await world(c);
    await as(stranger, async () => {
      // GET /orders/:id/spots replaced the body-keyed legacy route in the
      // read-flip wave; requireOwnOrderParam reads the id from the path.
      const res = await request(app).get(`/api/orders/${order.id}/spots`);
      assert.equal(res.status, 403, `answered ${res.status} with somebody else's spot prices`);
    });
  }, { actor: TEST_ACTOR.id, lock: ORDER_LOCK });
});

// The offer routes left with 086; the accept route left with the PATCH
// consolidation; and 'Accepted' itself left the lifecycle with migration 092.
// What remains of acceptance is the finalize_pricing field of the unified
// order PATCH, and the whole route is requireAdmin: a plain user - including
// the order's own owner - is refused outright, because pricing decides what
// the business pays and customers have no order-management surface at all.
test("a plain user cannot finalize an order's pricing, even their own", async () => {
  await inPinnedTransaction(async (c: PoolClient) => {
    const { victim, order } = await world(c);
    await as(victim, async () => {
      const res = await request(app)
        .patch(`/api/orders/${order.id}`)
        .send({ finalize_pricing: true });
      assert.equal(res.status, 403, `answered ${res.status} - a customer priced an order`);
    });
  }, { actor: TEST_ACTOR.id, lock: ORDER_LOCK });
});

// The expensive one. A successful call here creates a real FedEx return label
// and sends another customer's metal back to them.
test("a stranger cannot cancel somebody else's order", async () => {
  await inPinnedTransaction(async (c: PoolClient) => {
    const { stranger, order } = await world(c);
    await as(stranger, async () => {
      const res = await request(app)
        .patch(`/api/orders/${order.id}`)
        .send({ cancel: { return_shipment: {} } });
      assert.equal(
        res.status,
        403,
        `answered ${res.status} - a stranger reached the code that buys a return label`
      );
    });
  }, { actor: TEST_ACTOR.id, lock: ORDER_LOCK });
});

// And the owner is still allowed, or the fix has broken the feature rather than
// secured it.
test("the order's own customer can still read its spots", async () => {
  await inPinnedTransaction(async (c: PoolClient) => {
    const { victim, order } = await world(c);
    await as(victim, async () => {
      const res = await request(app).get(`/api/orders/${order.id}/spots`);
      // The ids are in the message because this failed once in the full suite
      // and passed in isolation, and "403 !== 200" says nothing about which of
      // the three tables the guard looked in or who it thought the caller was.
      assert.equal(
        res.status,
        200,
        `the owner was refused their own order: ${res.status} - ` +
          `order ${order.id} owned by ${order.user_id}, caller ${victim.id}, ` +
          `body ${JSON.stringify(res.body)}`
      );
      assert.ok(Array.isArray(res.body));
    });
  }, { actor: TEST_ACTOR.id, lock: ORDER_LOCK });
});

test("an admin can still reach any order", async () => {
  await inPinnedTransaction(async (c: PoolClient) => {
    const { order } = await world(c);
    await asAdmin(TEST_ACTOR, async () => {
      const res = await request(app).get(`/api/orders/${order.id}/spots`);
      assert.equal(res.status, 200, "an admin was refused an order they administer");
    });
  }, { actor: TEST_ACTOR.id, lock: ORDER_LOCK });
});
