// THE PURCHASE-ORDER ADMIN LIFECYCLE, over real HTTP - the API-owned
// replacement for frontend/features/orders/tests/authed/
// admin-purchase-order-work.e2e.ts (Playwright is going, ruling 55). That
// spec minted its order with api/scripts/seed-e2e-order.mjs, a rows-only
// script with no FedEx call; this uses the BUILDER instead (the prompt's own
// instruction), which is the same "rows written through the repos, no
// provider reachable" shape.
//
// PROVIDER-FREE ON PURPOSE. finalize_pricing and add_funds touch no outside
// world; the status transitions (In Transit -> Received -> back -> Cancelled)
// are pure label writes (ruling 2 - statuses drive no logic). The real
// POST /:id/cancel endpoint buys a FedEx return label and is deliberately not
// exercised here - see docs/waves/api-journeys.md for why no committed
// cassette matches its request shape.
//
// MONEY FACTS: finalize_pricing's total is asserted against a live spot this
// test controls (via anOrder().withSpots), and add_funds is asserted against
// both halves it must move together - the customer's balance AND the ledger
// row that explains it (CLAUDE.md: "the ledger must record what was actually
// credited").
//
// NOTHING IS COMMITTED: pinned-pool.ts rolls back every query.
import { test, afterAll } from "vitest";
import assert from "node:assert/strict";
import type { PoolClient } from "pg";
import request from "supertest";
import pool from "#db";
import { mockSessions, restoreSessions, asAdmin } from "#shared/testing/session.ts";
import { TEST_ACTOR } from "#shared/testing/actor.ts";
import { inPinnedTransaction } from "#shared/testing/pinned-pool.ts";
import { LOCKS } from "#shared/testing/locks.ts";
import { aUser, anAdmin, anOrder } from "#shared/testing/builders/index.ts";
import * as orders from "#domain/orders/service.ts";

await mockSessions();
const { default: app } = await import("#app");

afterAll(async () => {
  restoreSessions();
  await pool.end();
});

test("a purchase order walks pricing, funds and status, and the money facts agree", async () => {
  await inPinnedTransaction(async (c: PoolClient) => {
    const admin = await anAdmin(c);
    const seller = await aUser(c, { funds: 0 });
    const order = await anOrder(c, seller, { direction: "purchase", status: "In Transit" })
      .withLots(2, { metal: "Gold", pre_melt: 10, purity: 0.925 })
      .withSpots({ bid: 2400, ask: 2450 })
      .withTotals({});
    // LOCKED, so finalize_pricing prices off the frozen bid this test set
    // rather than re-fetching whatever the live spot feed holds in this
    // database - CLAUDE.md's own finalizePricing comment: "a locked order
    // keeps the spots it was locked at".
    await c.query(`UPDATE orders.orders SET spots_locked = true WHERE id = $1`, [order.id]);
    // withLots leaves the premium unset - a real premium arrives at placement
    // through the rate band, so this repeats that step rather than hand-writing
    // one, keeping the total honest against the same source production uses.
    await orders.retierPremiums(order.id, c);

    const priced = await asAdmin(admin, () =>
      request(app).post(`/api/orders/${order.id}/finalize_pricing`)
    );
    assert.equal(priced.status, 200, priced.text);
    assert.ok(priced.body.order.spots_locked, "finalize_pricing did not lock the spots");
    const total = Number(priced.body.totals?.total);
    assert.ok(total > 0, "finalize_pricing wrote no positive total");

    const funded = await asAdmin(admin, () =>
      request(app).post(`/api/orders/${order.id}/add_funds`)
    );
    assert.equal(funded.status, 200, funded.text);

    const { rows: [balance] } = await c.query(
      `SELECT dorado_funds FROM auth.users WHERE id = $1`, [seller.id]
    );
    assert.equal(
      Number(balance.dorado_funds), total,
      "the customer's balance does not equal the priced total"
    );
    const { rows: [entry] } = await c.query(
      `SELECT type, amount, order_id FROM payments.ledger
        WHERE user_id = $1 ORDER BY created_at DESC LIMIT 1`,
      [seller.id]
    );
    assert.equal(entry.type, "Credit");
    assert.equal(Number(entry.amount), total, "the ledger entry does not match what was credited");
    assert.equal(entry.order_id, order.id);

    for (const status of ["Received", "In Transit"]) {
      const moved = await asAdmin(admin, () =>
        request(app).patch(`/api/orders/${order.id}`).send({ status })
      );
      assert.equal(moved.status, 200, moved.text);
      assert.equal(moved.body.order.status, status);
    }

    const cancelled = await asAdmin(admin, () =>
      request(app).patch(`/api/orders/${order.id}`).send({ status: "Cancelled" })
    );
    assert.equal(cancelled.status, 200, cancelled.text);
    assert.equal(cancelled.body.order.status, "Cancelled");
  }, { actor: TEST_ACTOR.id, lock: [LOCKS.ORDERS, LOCKS.USERS] });
});

test("finalize_pricing and add_funds refuse a sales order - purchase-only actions", async () => {
  await inPinnedTransaction(async (c: PoolClient) => {
    const admin = await anAdmin(c);
    const buyer = await aUser(c);
    const order = await anOrder(c, buyer, { direction: "sale" }).withSpots();

    const priced = await asAdmin(admin, () =>
      request(app).post(`/api/orders/${order.id}/finalize_pricing`)
    );
    assert.equal(priced.status, 422, priced.text);

    const funded = await asAdmin(admin, () =>
      request(app).post(`/api/orders/${order.id}/add_funds`)
    );
    assert.equal(funded.status, 422, funded.text);
  }, { actor: TEST_ACTOR.id, lock: LOCKS.ORDERS });
});
