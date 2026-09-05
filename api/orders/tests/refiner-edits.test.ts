import { test, afterAll } from "vitest";
import assert from "node:assert/strict";
import fs from "node:fs";
import request from "supertest";
import pool from "#pool";
import { mockSessions, restoreSessions, as, anonymous, asAdmin, asUser } from "#shared/testing/session.ts";
import { TEST_ACTOR, TEST_CUSTOMER } from "#shared/testing/actor.ts";
import { inPinnedTransaction } from "#shared/testing/pinned-pool.ts";
import {
  aUser, anOrder, aRefinerEngagement, aPayout,
} from "#shared/testing/builders/index.ts";
import { LOCKS } from "#shared/testing/locks.ts";
import type { PoolClient } from "pg";

const ORDER_LOCK = LOCKS.ORDERS;

await mockSessions();
const { default: app } = await import("#app");

const MIGRATION = fs.readFileSync(
  new URL("../../migrations/093_the_refiner_engagement_gets_its_own_orders.sql", import.meta.url),
  "utf8"
);

type UserFixture = { id: string; name: string | null; email: string | null };
type RefinerMetalFixture = { order_id: string; metal_id: string; type: string };
type ScrapItemFixture = { id: string; order_id: string };

let refinerMetal: RefinerMetalFixture;
let scrapItem: ScrapItemFixture;

const admin = TEST_ACTOR;
const customer = TEST_CUSTOMER;

const world = async (c: PoolClient) => {
  const owner = await aUser(c, { name: "The Customer" });
  const order = await anOrder(c, owner, { direction: "purchase", status: "Pending" })
    .withLots(1, { metal_id: "Gold", pre_melt: 10, purity: 0.585 })
    .withSpots()
    .withTotals({ total: 1000 });
  await aRefinerEngagement(c, order);
  const payout = await aPayout(c, owner, { order });
  return {
    refinerMetal: {
      order_id: order.id,
      metal_id: order.items[0]!.metal_id,
      type: "Gold",
    },
    scrapItem: { id: order.items[0]!.id, order_id: order.id },
    payoutId: payout.id,
    owner,
  };
};

afterAll(async () => {
  restoreSessions();
  await pool.end();
});

const withEngagement = async (client: PoolClient, orderId: string): Promise<string> => {
  await client.query(MIGRATION);
  const { rows } = await client.query(
    `SELECT id FROM refiners.orders WHERE order_id = $1`,
    [orderId]
  );
  assert.ok(rows[0], `the backfill made no engagement for order ${orderId}`);
  return rows[0].id;
};

test("the mirror invariant: one engagement per order, items matched, spots covered", async () => {
  await inPinnedTransaction(async (client: PoolClient) => {
    await client.query(MIGRATION);
    const { rows } = await client.query(`SELECT
      (SELECT count(*) FROM orders.orders)::int oo,
      (SELECT count(*) FROM refiners.orders)::int ro,
      (SELECT count(*) FROM orders.items)::int oi,
      (SELECT count(*) FROM refiners.items)::int ri,
      (SELECT count(*) FROM orders.spots os
        WHERE NOT EXISTS (SELECT 1 FROM refiners.spots rs
                           WHERE rs.order_id = os.order_id
                             AND rs.metal_id = os.metal_id))::int spots_uncovered,
      (SELECT count(*) FROM refiners.items WHERE refiner_order_id IS NULL)::int items_unlinked,
      (SELECT count(*) FROM refiners.spots WHERE refiner_order_id IS NULL)::int spots_unlinked`);
    const c = rows[0];
    assert.equal(c.oo, c.ro, `${c.oo} orders but ${c.ro} engagements`);
    assert.equal(c.oi, c.ri, `${c.oi} customer lines but ${c.ri} refiner lines`);
    assert.equal(c.spots_uncovered, 0, "a customer spot has no refiner counterpart");
    assert.equal(c.items_unlinked, 0, "a refiner line is not linked to an engagement");
    assert.equal(c.spots_unlinked, 0, "a refiner spot is not linked to an engagement");
  }, { actor: TEST_ACTOR.id, lock: ORDER_LOCK });
});

test("the engagement PATCH writes the refiner's spot for that metal on that order", async () => {
  await inPinnedTransaction(async (client: PoolClient) => {
    const { refinerMetal } = await world(client);
    const engagementId = await withEngagement(client, refinerMetal.order_id);
    await asAdmin(admin, async () => {
      const res = await request(app)
        .patch(`/api/refiners/orders/${engagementId}`)
        .send({ spots: [{ metal_id: refinerMetal.metal_id, bid: 1234.56 }] });

      assert.equal(res.status, 200, `answered ${res.status}: ${JSON.stringify(res.body)}`);

      const { rows } = await client.query(
        `SELECT sp.bid FROM refiners.spots sp
         WHERE sp.order_id = $1 AND sp.metal_id = $2`,
        [refinerMetal.order_id, refinerMetal.type]
      );
      assert.ok(rows.length, "no refiners.spots row matched");
      assert.equal(Number(rows[0].bid), 1234.56, "the refiner bid did not change");
    });
  }, { actor: TEST_ACTOR.id, lock: ORDER_LOCK });
});

test("the engagement PATCH lands pool and fee on the engagement AND the order's money row", async () => {
  await inPinnedTransaction(async (client: PoolClient) => {
    const { refinerMetal } = await world(client);
    const engagementId = await withEngagement(client, refinerMetal.order_id);
    await asAdmin(admin, async () => {
      const res = await request(app)
        .patch(`/api/refiners/orders/${engagementId}`)
        .send({ pool_oz_deducted: 1.2345, pool_remediation: 34.56, fee: 23.45 });

      assert.equal(res.status, 200, `answered ${res.status}: ${JSON.stringify(res.body)}`);

      const engagement = (
        await client.query(
          `SELECT pool_oz_deducted, pool_remediation, fee FROM refiners.orders WHERE id = $1`,
          [engagementId]
        )
      ).rows[0];
      assert.equal(Number(engagement.pool_oz_deducted), 1.2345);
      assert.equal(Number(engagement.pool_remediation), 34.56);
      assert.equal(Number(engagement.fee), 23.45);

      const money = (
        await client.query(
          `SELECT pool_oz_deducted, pool_remediation, refiner_fee
             FROM orders.transactions WHERE order_id = $1`,
          [refinerMetal.order_id]
        )
      ).rows[0];
      assert.equal(Number(money.pool_oz_deducted), 1.2345, "the money row lost the pool ounces");
      assert.equal(Number(money.pool_remediation), 34.56, "the money row lost the remediation");
      assert.equal(Number(money.refiner_fee), 23.45, "the money row lost the fee");
    });
  }, { actor: TEST_ACTOR.id, lock: ORDER_LOCK });
});

test("the item PATCH writes the refiner premium on that line", async () => {
  await inPinnedTransaction(async (client: PoolClient) => {
    const { scrapItem } = await world(client);
    await asAdmin(admin, async () => {
      const res = await request(app)
        .patch(`/api/refiners/items/by-order-item/${scrapItem.id}`)
        .send({ premium: 0.875 });

      assert.equal(res.status, 200, `answered ${res.status}: ${JSON.stringify(res.body)}`);

      const { rows } = await client.query(
        `SELECT premium FROM refiners.items WHERE order_item_id = $1`,
        [scrapItem.id]
      );
      assert.equal(Number(rows[0].premium), 0.875, "the refiner premium did not change");
    });
  }, { actor: TEST_ACTOR.id, lock: ORDER_LOCK });
});

test("the item PATCH writes the assay report to the actual columns", async () => {
  await inPinnedTransaction(async (client: PoolClient) => {
    const { scrapItem } = await world(client);
    await asAdmin(admin, async () => {
      const res = await request(app)
        .patch(`/api/refiners/items/by-order-item/${scrapItem.id}`)
        .send({ purity: 0.9, post_melt: 3.0 });

      assert.equal(res.status, 200, `answered ${res.status}: ${JSON.stringify(res.body)}`);

      const { rows } = await client.query(
        `SELECT purity, post_melt, content FROM refiners.items WHERE order_item_id = $1`,
        [scrapItem.id]
      );
      assert.equal(Number(rows[0].purity), 0.9, "purity_actual did not land");
      assert.equal(Number(rows[0].post_melt), 3.0, "post_melt_actual did not land");
      assert.ok(rows[0].content !== null, "content_actual was not derived");
    });
  }, { actor: TEST_ACTOR.id, lock: ORDER_LOCK });
});

test("poisoned bodies refuse by name on both refiners endpoints", async () => {
  await inPinnedTransaction(async (client: PoolClient) => {
    const { refinerMetal, scrapItem } = await world(client);
    const engagementId = await withEngagement(client, refinerMetal.order_id);
    await asAdmin(admin, async () => {
      const item = await request(app)
        .patch(`/api/refiners/items/by-order-item/${scrapItem.id}`)
        .send({ premium: 0.9, order_spots: [] });
      assert.equal(item.status, 400, `answered ${item.status}`);
      assert.match(item.body?.error?.message ?? "", /"order_spots"/);

      const derived = await request(app)
        .patch(`/api/refiners/items/by-order-item/${scrapItem.id}`)
        .send({ content: 1.5 });
      assert.equal(derived.status, 400, `answered ${derived.status}`);
      assert.match(derived.body?.error?.message ?? "", /content/);

      const engagement = await request(app)
        .patch(`/api/refiners/orders/${engagementId}`)
        .send({ total_price: 100000 });
      assert.equal(engagement.status, 400, `answered ${engagement.status}`);
      assert.match(engagement.body?.error?.message ?? "", /"total_price"/);

      const { rows } = await client.query(
        `SELECT premium FROM refiners.items WHERE order_item_id = $1`,
        [scrapItem.id]
      );
      assert.notEqual(Number(rows[0].premium), 0.9, "a refused document still wrote");
    });
  }, { actor: TEST_ACTOR.id, lock: ORDER_LOCK });
});

test("both refiners endpoints refuse a customer and an anonymous caller", async () => {
  await inPinnedTransaction(async (client: PoolClient) => {
    const { refinerMetal, scrapItem } = await world(client);
    const engagementId = await withEngagement(client, refinerMetal.order_id);
    const callers: Array<[string, (fn: () => Promise<void>) => Promise<void>]> = [
      ["customer", (fn) => asUser(customer, fn)],
      ["anonymous", (fn) => anonymous(fn)],
    ];
    for (const [who, run] of callers) {
      await run(async () => {
        const item = await request(app)
          .patch(`/api/refiners/items/by-order-item/${scrapItem.id}`)
          .send({ premium: 0.5 });
        assert.ok([401, 403].includes(item.status), `${who} was answered ${item.status}`);

        const engagement = await request(app)
          .patch(`/api/refiners/orders/${engagementId}`)
          .send({ fee: 1 });
        assert.ok([401, 403].includes(engagement.status), `${who} was answered ${engagement.status}`);
      });
    }
  }, { actor: TEST_ACTOR.id, lock: ORDER_LOCK });
});

test("GET /payments/details/:id/bank answers with the payout's fields", async () => {
  await inPinnedTransaction(async (c: PoolClient) => {
    const { payoutId } = await world(c);
    await asAdmin(admin, async () => {
      const res = await request(app).get(`/api/payments/details/${payoutId}/bank`);

      assert.equal(res.status, 200, `the details read answered ${res.status}`);

      const payout = Array.isArray(res.body) ? res.body[0] : res.body;
      assert.ok(payout && typeof payout === "object", "no payout object came back");

      for (const key of ["method_id", "account_holder"]) {
        assert.ok(key in payout, `the payout is missing ${key}`);
      }
    });
  }, { actor: TEST_ACTOR.id, lock: ORDER_LOCK });
});

test("a customer cannot read a payout's bank details", async () => {
  await inPinnedTransaction(async (c: PoolClient) => {
    const { payoutId } = await world(c);
    await asUser(customer, async () => {
      const res = await request(app).get(`/api/payments/details/${payoutId}/bank`);

      assert.ok(
        [401, 403].includes(res.status),
        `a signed-in customer was answered ${res.status}`
      );
    });
  }, { actor: TEST_ACTOR.id, lock: ORDER_LOCK });
});

test("an anonymous caller cannot read a payout's bank details", async () => {
  await inPinnedTransaction(async (c: PoolClient) => {
    const { payoutId } = await world(c);
    await anonymous(async () => {
      const res = await request(app).get(`/api/payments/details/${payoutId}/bank`);

      assert.ok(
        [401, 403].includes(res.status),
        `an anonymous caller was answered ${res.status}`
      );
    });
  }, { actor: TEST_ACTOR.id, lock: ORDER_LOCK });
});
