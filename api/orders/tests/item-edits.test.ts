import { test, afterAll } from "vitest";
import assert from "node:assert/strict";
import type { PoolClient } from "pg";
import request from "supertest";
import pool from "#pool";
import { mockSessions, restoreSessions, as, asAdmin } from "#shared/testing/session.ts";
import { TEST_ACTOR } from "#shared/testing/actor.ts";
import { inPinnedTransaction } from "#shared/testing/pinned-pool.ts";
import {
  aUser, aProduct, anOrder, aRefinerEngagement,
} from "#shared/testing/builders/index.ts";

await mockSessions();
const { default: app } = await import("#app");

type UserFixture = { id: string; name: string | null; email: string | null };
type ItemFixture = { id: string; order_id: string };
type ScrapItemFixture = ItemFixture;

const admin: UserFixture = TEST_ACTOR;

const lines = async (c: PoolClient) => {
  const customer = await aUser(c);
  const product = await aProduct(c);
  const order = await anOrder(c, customer, { direction: "purchase", status: "Pending" })
    .withBullion(product, 1)
    .withLots(1, { metal_id: "Gold", pre_melt: 10, purity: 0.585 })
    .withSpots();
  await aRefinerEngagement(c, order);
  return {
    item: { id: order.items[0]!.id, order_id: order.id },
    scrapItem: { id: order.items[1]!.id, order_id: order.id },
  };
};

afterAll(async () => {
  restoreSessions();
  await pool.end();
});

test("confirmed: true confirms the line", async () => {
  await inPinnedTransaction(async (client: PoolClient) => {
    const { item } = await lines(client);
    await asAdmin(admin, async () => {
      await client.query(
        `UPDATE orders.items SET confirmed = false WHERE id = $1`,
        [item.id]
      );

      const res = await request(app)
        .patch(`/api/orders/items/${item.id}`)
        .send({ confirmed: true });

      assert.equal(res.status, 200, `answered ${res.status}: ${JSON.stringify(res.body)}`);

      const { rows } = await client.query(
        `SELECT confirmed FROM orders.items WHERE id = $1`,
        [item.id]
      );
      assert.equal(rows[0].confirmed, true, "the line was not confirmed");
    });
  }, { actor: TEST_ACTOR.id });
});

test("confirmed: false unconfirms the line", async () => {
  await inPinnedTransaction(async (client: PoolClient) => {
    const { item } = await lines(client);
    await asAdmin(admin, async () => {
      await client.query(
        `UPDATE orders.items SET confirmed = true WHERE id = $1`,
        [item.id]
      );

      const res = await request(app)
        .patch(`/api/orders/items/${item.id}`)
        .send({ confirmed: false });

      assert.equal(res.status, 200, `answered ${res.status}: ${JSON.stringify(res.body)}`);

      const { rows } = await client.query(
        `SELECT confirmed FROM orders.items WHERE id = $1`,
        [item.id]
      );
      assert.equal(rows[0].confirmed, false, "the line was not reset");
    });
  }, { actor: TEST_ACTOR.id });
});

test("the refiner spots read answers by customer-order id", async () => {
  await inPinnedTransaction(async (client: PoolClient) => {
    const { item } = await lines(client);
    await asAdmin(admin, async () => {
      const res = await request(app)
        .get(`/api/orders/${item.order_id}/refiners/spots`);

      assert.equal(res.status, 200, `answered ${res.status}`);
      assert.ok(Array.isArray(res.body), "expected a list of metals");

      const eng = await request(app)
        .get(`/api/orders/${item.order_id}/refiners`);
      assert.equal(eng.status, 200, `the engagement read answered ${eng.status}`);
      assert.ok(eng.body.id, "the engagement row carries no id to PATCH by");
      assert.equal(eng.body.order_id, item.order_id);
    });
  }, { actor: TEST_ACTOR.id });
});

test("the line's own columns are the body, and content is derived from them", async () => {
  await inPinnedTransaction(async (client: PoolClient) => {
    const { scrapItem } = await lines(client);
    await asAdmin(admin, async () => {
      const res = await request(app)
        .patch(`/api/orders/items/${scrapItem.id}`)
        .send({
          premium: 0.925,
          pre_melt: 3.5,
          post_melt: 3.25,
          purity: 0.9167,
          unit: "t oz",
        });

      assert.equal(res.status, 200, `answered ${res.status}: ${JSON.stringify(res.body)}`);

      const line = await client.query(
        `SELECT premium, pre_melt, purity, content FROM orders.items WHERE id = $1`,
        [scrapItem.id]
      );
      assert.equal(Number(line.rows[0].premium), 0.925, "the line premium did not change");
      assert.equal(Number(line.rows[0].pre_melt), 3.5, "the scrap weight did not change");

      assert.equal(
        Number(line.rows[0].purity),
        0.9167,
        "the scrap purity was rounded - orders.items.purity has narrowed"
      );

      assert.ok(
        Math.abs(Number(line.rows[0].content) - 3.25 * 0.9167) < 1e-6,
        `content is ${line.rows[0].content}, not the derived 3.25 x 0.9167`
      );
    });
  }, { actor: TEST_ACTOR.id });
});

test("the assay columns are refused on the line's own patch", async () => {
  await inPinnedTransaction(async (client: PoolClient) => {
    const { scrapItem } = await lines(client);
    await asAdmin(admin, async () => {
      const res = await request(app)
        .patch(`/api/orders/items/${scrapItem.id}`)
        .send({ purity_actual: 0.5, post_melt_actual: 3 });
      assert.equal(res.status, 400, `answered ${res.status}`);
      assert.match(res.body?.error?.message ?? "", /purity_actual/);
    });
  }, { actor: TEST_ACTOR.id });
});

test("DELETE removes the line and its scrap together", async () => {
  await inPinnedTransaction(async (client: PoolClient) => {
    const { scrapItem } = await lines(client);
    await asAdmin(admin, async () => {
      const res = await request(app).delete(`/api/orders/items/${scrapItem.id}`);

      assert.equal(res.status, 200, `answered ${res.status}: ${JSON.stringify(res.body)}`);

      const line = await client.query(
        `SELECT 1 FROM orders.items WHERE id = $1`,
        [scrapItem.id]
      );
      assert.equal(line.rows.length, 0, "the order line survived");

      const refiner = await client.query(
        `SELECT 1 FROM refiners.items WHERE order_item_id = $1`, [scrapItem.id]
      );
      assert.equal(refiner.rows.length, 0, "the refiner counterpart survived the cascade");
    });
  }, { actor: TEST_ACTOR.id });
});
