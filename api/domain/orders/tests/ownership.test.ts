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
import test, { after, before } from "node:test";
import assert from "node:assert/strict";
import request from "supertest";
import pool from "#db";
import { mockSessions, restoreSessions, as, asAdmin } from "#shared/testing/session.ts";
import { inPinnedTransaction, outside } from "#shared/testing/pinned-pool.ts";

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

let victim: UserFixture & { role: string };
let stranger: UserFixture & { role: string };
let order: OrderFixture;

before(async () => {
  // The OLDEST open order, not the newest, and that is the whole point.
  //
  // This file failed once in the full suite and passed in isolation, and the
  // diagnostic said the guard refused an order whose owner was the caller - for
  // an order id that does not exist in any of the three tables now. The fixture
  // was "the newest open order", which is a race against every other file that
  // creates one: another suite's order was visible when before() ran and gone
  // by the time the request was made, because that file's transaction had
  // rolled back in between.
  //
  // Uncommitted rows are not visible across connections, so the read that saw
  // it was inside no transaction of its own and caught a row mid-flight; the
  // detail that matters is not the mechanism but that the fixture was not
  // stable. The oldest order is: nothing creates rows older than the ones dev
  // already has, so this picks the same one every time, in isolation and in the
  // full suite.
  const orders = await outside<OrderFixture>(
    `SELECT po.id, po.user_id, po.purchase_order_status, po.order_number
       FROM exchange.purchase_orders po
      WHERE po.user_id IS NOT NULL
        AND po.purchase_order_status NOT IN ('Cancelled', 'Completed')
      ORDER BY po.created_at ASC, po.id ASC LIMIT 1`
  );
  order = orders[0];
  assert.ok(order, "dev has no open purchase order with an owner");

  const owner = await outside<UserFixture>(`SELECT id, name, email FROM exchange.users WHERE id = $1`, [
    order.user_id,
  ]);
  victim = { id: owner[0].id, name: owner[0].name, email: owner[0].email, role: "user" };
  // Asserted, because without it a lookup returning nothing makes victim
  // `{ role: "user" }` with an undefined id - and the only symptom is the
  // owner-can-still-read test getting a 403 it cannot explain. That is exactly
  // how this file failed once in the full suite and passed in isolation.
  assert.ok(
    victim.id,
    `no exchange.users row for ${order.user_id}, the owner of order ${order.id}`
  );

  // And the order is still there when the tests actually run, not merely when
  // before() looked. A fixture that vanishes between selection and use is what
  // made this file intermittent.
  const [{ n }] = await outside<{ n: number }>(
    `SELECT count(*)::int AS n FROM exchange.purchase_orders WHERE id = $1`,
    [order.id]
  );
  assert.equal(n, 1, `order ${order.id} disappeared between being chosen and being used`);

  const others = await outside<UserFixture>(
    `SELECT id, name, email FROM exchange.users
      WHERE id <> $1 AND role IS DISTINCT FROM 'admin' LIMIT 1`,
    [order.user_id]
  );
  stranger = { id: others[0].id, name: others[0].name, email: others[0].email, role: "user" };
  assert.ok(stranger?.id, "dev has only one non-admin user, so this cannot be tested");
  assert.notEqual(stranger.id, victim.id);
});

after(async () => {
  restoreSessions();
  await pool.end();
});

test("a stranger cannot read the spots frozen on somebody else's order", async () => {
  await inPinnedTransaction(async () => {
    await as(stranger, async () => {
      // GET /orders/:id/spots replaced the body-keyed legacy route in the
      // read-flip wave; requireOwnOrderParam reads the id from the path.
      const res = await request(app).get(`/api/orders/${order.id}/spots`);
      assert.equal(res.status, 403, `answered ${res.status} with somebody else's spot prices`);
    });
  }, { lock: ORDER_LOCK });
});

// The offer routes left with 086; the accept route left with the PATCH
// consolidation; and 'Accepted' itself left the lifecycle with migration 092.
// What remains of acceptance is the finalize_pricing field of the unified
// order PATCH, and the whole route is requireAdmin: a plain user - including
// the order's own owner - is refused outright, because pricing decides what
// the business pays and customers have no order-management surface at all.
test("a plain user cannot finalize an order's pricing, even their own", async () => {
  await inPinnedTransaction(async () => {
    await as(victim, async () => {
      const res = await request(app)
        .patch(`/api/orders/${order.id}`)
        .send({ finalize_pricing: true });
      assert.equal(res.status, 403, `answered ${res.status} - a customer priced an order`);
    });
  }, { lock: ORDER_LOCK });
});

// The expensive one. A successful call here creates a real FedEx return label
// and sends another customer's metal back to them.
test("a stranger cannot cancel somebody else's order", async () => {
  await inPinnedTransaction(async () => {
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
  }, { lock: ORDER_LOCK });
});

// And the owner is still allowed, or the fix has broken the feature rather than
// secured it.
test("the order's own customer can still read its spots", async () => {
  await inPinnedTransaction(async () => {
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
  }, { lock: ORDER_LOCK });
});

test("an admin can still reach any order", async () => {
  await inPinnedTransaction(async () => {
    const admins = await outside<UserFixture>(`SELECT id, name, email FROM exchange.users WHERE role = 'admin' LIMIT 1`);
    await asAdmin(admins[0], async () => {
      const res = await request(app).get(`/api/orders/${order.id}/spots`);
      assert.equal(res.status, 200, "an admin was refused an order they administer");
    });
  }, { lock: ORDER_LOCK });
});
