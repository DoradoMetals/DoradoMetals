// THE SALES-ORDER ADMIN LIFECYCLE, over real HTTP - the API-owned
// replacement for the lifecycle half of frontend/features/orders/tests/
// authed/admin-sales-order-work.e2e.ts (Playwright is going, ruling 55).
//
// THE E2E SPEC'S SEED PRIMED A REAL STRIPE TEST-MODE INTENT before creating
// the order. That step has no committed cassette for a checkout-priced
// amount (a cassette pins the exact request body, and Stripe's `amount` is
// never normalised - see docs/waves/api-journeys.md), so this test builds the
// order and its payment intent through the BUILDERS instead (the prompt's own
// instruction for the seeded-order replacement) and drives everything AFTER
// that point - the part this pass owns - over real HTTP: born Pending, moved
// to Preparing and Shipped (statuses are pure labels, ruling 2, so no
// provider sits behind either), and ended Cancelled exactly the way the real
// e2e spec's own afterAll does (a plain status PATCH, not the customer-facing
// cancel flow, which purchase orders alone expose - domain/orders/service.ts
// asserts direction "purchase" on POST /:id/cancel).
//
// MONEY FACT: the intent's amount_expected is what a real checkout would have
// asked Stripe to charge, and it survives every status transition unchanged -
// a status write must never touch money.
//
// NOTHING IS COMMITTED: pinned-pool.ts rolls back every query.
import { test, afterAll } from "vitest";
import assert from "node:assert/strict";
import type { PoolClient } from "pg";
import request from "supertest";
import pool from "#pool";
import { mockSessions, restoreSessions, asAdmin } from "#shared/testing/session.ts";
import { TEST_ACTOR } from "#shared/testing/actor.ts";
import { inPinnedTransaction } from "#shared/testing/pinned-pool.ts";
import { LOCKS } from "#shared/testing/locks.ts";
import {
  aUser, anAdmin, anOrder, aProduct, aPaymentIntent,
} from "#shared/testing/builders/index.ts";

await mockSessions();
const { default: app } = await import("#app");

afterAll(async () => {
  restoreSessions();
  await pool.end();
});

test("a sales order is born Pending, moves to Preparing and Shipped, and cancels", async () => {
  await inPinnedTransaction(async (c: PoolClient) => {
    const admin = await anAdmin(c);
    const buyer = await aUser(c);
    const product = await aProduct(c, { metal: "Gold", content: 1, ask_premium: 75 });
    const order = await anOrder(c, buyer, { direction: "sale", status: "Pending" })
      .withBullion(product, 1)
      .withTotals({ total: 2475 });
    const intent = await aPaymentIntent(c, buyer, {
      type: "customer", amount_expected: 2475, order,
    });

    const read = await asAdmin(admin, () =>
      request(app).get(`/api/orders?direction=sale`)
    );
    assert.equal(read.status, 200, read.text);
    // The SLIM list (transport/orders/controller.ts): each row is the order's
    // own columns plus `totals`, not the nested OrderView the PATCH/action
    // responses answer.
    const row = read.body.find((o: { id: string }) => o.id === order.id);
    assert.ok(row, "the built sale did not appear in the admin list");
    assert.equal(row.status, "Pending", "a freshly built sale should be Pending");

    for (const status of ["Preparing", "Shipped"]) {
      const moved = await asAdmin(admin, () =>
        request(app).patch(`/api/orders/${order.id}`).send({ status })
      );
      assert.equal(moved.status, 200, moved.text);
      assert.equal(moved.body.order.status, status);
    }

    const { rows: [stillTheSameIntent] } = await c.query(
      `SELECT amount_expected FROM payments.intents WHERE id = $1`, [intent.id]
    );
    assert.equal(
      Number(stillTheSameIntent.amount_expected), 2475,
      "a status transition changed the intent's amount"
    );

    const cancelled = await asAdmin(admin, () =>
      request(app).patch(`/api/orders/${order.id}`).send({ status: "Cancelled" })
    );
    assert.equal(cancelled.status, 200, cancelled.text);
    assert.equal(cancelled.body.order.status, "Cancelled");
  }, { actor: TEST_ACTOR.id, lock: LOCKS.ORDERS });
});

test("the real cancel endpoint is purchase-only: a sales order is refused, not charged", async () => {
  await inPinnedTransaction(async (c: PoolClient) => {
    const admin = await anAdmin(c);
    const buyer = await aUser(c);
    const order = await anOrder(c, buyer, { direction: "sale" });

    const cancelled = await asAdmin(admin, () =>
      request(app).post(`/api/orders/${order.id}/cancel`).send({
        carrier_service_id: "00000000-0000-4000-8000-000000000000",
        package_id: "00000000-0000-4000-8000-000000000000",
      })
    );
    assert.equal(cancelled.status, 422, cancelled.text);
  }, { actor: TEST_ACTOR.id, lock: LOCKS.ORDERS });
});
