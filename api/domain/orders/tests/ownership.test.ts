import { test, afterAll } from "vitest";
import assert from "node:assert/strict";
import request from "supertest";
import pool from "#pool";
import { mockSessions, restoreSessions, as, asAdmin } from "#shared/testing/session.ts";
import { TEST_ACTOR } from "#shared/testing/actor.ts";
import { inPinnedTransaction } from "#shared/testing/pinned-pool.ts";
import { aUser, anOrder } from "#shared/testing/builders/index.ts";
import type { PoolClient } from "pg";

await mockSessions();
const { default: app } = await import("#app");

import { LOCKS } from "#shared/testing/locks.ts";
const ORDER_LOCK = LOCKS.ORDERS;

type UserFixture = { id: string; name: string | null; email: string | null };
type OrderFixture = {
  id: string;
  user_id: string;
  purchase_order_status: string;
  order_number: number;
};

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
      const res = await request(app).get(`/api/orders/${order.id}/spots`);
      assert.equal(res.status, 403, `answered ${res.status} with somebody else's spot prices`);
    });
  }, { actor: TEST_ACTOR.id, lock: ORDER_LOCK });
});

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

test("the order's own customer can still read its spots", async () => {
  await inPinnedTransaction(async (c: PoolClient) => {
    const { victim, order } = await world(c);
    await as(victim, async () => {
      const res = await request(app).get(`/api/orders/${order.id}/spots`);
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
