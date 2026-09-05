import { test, afterAll, beforeAll } from "vitest";
import assert from "node:assert/strict";
import type { PoolClient } from "pg";
import request from "supertest";
import pool from "#pool";
import { mockSessions, restoreSessions, as, asAdmin } from "#shared/testing/session.ts";
import { TEST_ACTOR } from "#shared/testing/actor.ts";
import { inPinnedTransaction, outside } from "#shared/testing/pinned-pool.ts";
import { LOCKS } from "#shared/testing/locks.ts";

const ORDER_LOCK = LOCKS.ORDERS;

await mockSessions();
const { default: app } = await import("#app");

type UserFixture = { id: string; name: string | null; email: string | null };
type SalesOrderFixture = { id: string; order_sent: boolean | null; supplier_id: string | null };
type RefinerFixture = { id: string; organization_id: string };

let admin: UserFixture;
let order: SalesOrderFixture;
let refiners: RefinerFixture[];

beforeAll(async () => {
  admin = TEST_ACTOR;

  order = (
    await outside<SalesOrderFixture>(
      `SELECT o.id, o.order_sent, ro.refiner_id AS supplier_id
         FROM orders.orders o
         JOIN orders.addresses oa ON oa.order_id = o.id
         LEFT JOIN refiners.orders ro ON ro.order_id = o.id
        WHERE o.direction = 'sale'
        ORDER BY o.created_at ASC, o.id ASC LIMIT 1`
    )
  )[0];
  assert.ok(order, "dev has no sales order with an address");

  refiners = await outside<RefinerFixture>(
    `SELECT r.id, r.organization_id FROM refiners.refiners r
      WHERE r.organization_id IS NOT NULL ORDER BY r.id`
  );
  assert.ok(refiners.length >= 1, "dev has no refiner to send to");
});

afterAll(async () => {
  restoreSessions();
  await pool.end();
});

test("an order that does not exist is refused before anything runs", async () => {
  await inPinnedTransaction(async () => {
    await asAdmin(admin, async () => {
      const res = await request(app)
        .post("/api/orders/00000000-0000-4000-8000-000000000000/send_to_refiner")
        .send({ refiner_id: refiners[0].id });
      assert.equal(res.status, 404, `answered ${res.status} against a nonexistent order`);
    });
  }, { actor: TEST_ACTOR.id, lock: ORDER_LOCK });
});

test("a refiner with no email is refused, and nothing is written", async () => {
  await inPinnedTransaction(async (client: PoolClient) => {
    await asAdmin(admin, async () => {
      await client.query(
        `UPDATE organizations.organizations SET email = NULL WHERE id = $1`,
        [refiners[0].organization_id]
      );
      await client.query(
        `UPDATE orders.orders SET order_sent = false WHERE id = $1`,
        [order.id]
      );
      await client.query(
        `UPDATE refiners.orders SET refiner_id = NULL WHERE order_id = $1`,
        [order.id]
      );

      const shipmentsBefore = (
        await client.query(
          `SELECT count(*)::int AS n
             FROM fulfillments.shipments fs
             JOIN fulfillments.fulfillments f ON f.id = fs.fulfillment_id
            WHERE f.order_id = $1`,
          [order.id]
        )
      ).rows[0].n;

      const res = await request(app)
        .post(`/api/orders/${order.id}/send_to_refiner`)
        .send({ refiner_id: refiners[0].id });

      assert.equal(res.status, 422, `answered ${res.status}: ${JSON.stringify(res.body)}`);

      const afterNext = (
        await client.query(
          `SELECT o.order_sent, ro.refiner_id
             FROM orders.orders o
             LEFT JOIN refiners.orders ro ON ro.order_id = o.id
            WHERE o.id = $1`,
          [order.id]
        )
      ).rows[0];
      assert.equal(afterNext?.order_sent, false, "a refused send marked orders.orders sent");
      assert.equal(afterNext?.refiner_id, null, "a refused send attached the refinery");

      const shipmentsAfter = (
        await client.query(
          `SELECT count(*)::int AS n
             FROM fulfillments.shipments fs
             JOIN fulfillments.fulfillments f ON f.id = fs.fulfillment_id
            WHERE f.order_id = $1`,
          [order.id]
        )
      ).rows[0].n;
      assert.equal(shipmentsAfter, shipmentsBefore, "a refused send still created a shipment");
    });
  }, { actor: TEST_ACTOR.id, lock: ORDER_LOCK });
});

test("a sent order cannot be moved to a different refiner", async (t) => {
  if (refiners.length < 2) {
    t.skip("dev has only one refiner, so there is no different one to refuse");
    return;
  }
  await inPinnedTransaction(async (client: PoolClient) => {
    await asAdmin(admin, async () => {
      await client.query(
        `UPDATE orders.orders SET order_sent = true WHERE id = $1`,
        [order.id]
      );
      await client.query(
        `UPDATE refiners.orders SET refiner_id = $2 WHERE order_id = $1`,
        [order.id, refiners[0].id]
      );

      const res = await request(app)
        .post(`/api/orders/${order.id}/send_to_refiner`)
        .send({ refiner_id: refiners[1].id });

      assert.equal(res.status, 409, `answered ${res.status}: ${JSON.stringify(res.body)}`);

      const after = (
        await client.query(`SELECT refiner_id FROM refiners.orders WHERE order_id = $1`, [order.id])
      ).rows[0];
      assert.equal(after.refiner_id, refiners[0].id, "the order moved to the second refiner");
    });
  }, { actor: TEST_ACTOR.id, lock: ORDER_LOCK });
});

test("the send body is one id, and nothing else is a field of it", async () => {
  await inPinnedTransaction(async () => {
    await asAdmin(admin, async () => {
      const res = await request(app)
        .post(`/api/orders/${order.id}/send_to_refiner`)
        .send({ refiner_id: refiners[0].id, send: false });
      assert.equal(res.status, 400, `answered ${res.status}`);
      assert.match(res.body?.error?.message ?? "", /send/);

      const missing = await request(app)
        .post(`/api/orders/${order.id}/send_to_refiner`)
        .send({});
      assert.equal(missing.status, 400, `answered ${missing.status}`);
      assert.match(missing.body?.error?.message ?? "", /refiner_id/);
    });
  }, { actor: TEST_ACTOR.id, lock: ORDER_LOCK });
});

test("a field the PATCH does not have - and a wrong-direction field - refuse by name", async () => {
  await inPinnedTransaction(async () => {
    await asAdmin(admin, async () => {
      const tracked = await request(app)
        .patch(`/api/orders/${order.id}`)
        .send({ tracking: { shipment_id: "x", tracking_number: "y", carrier_id: "z" } });
      assert.equal(tracked.status, 400, `answered ${tracked.status}`);
      assert.match(tracked.body?.error?.message ?? "", /"tracking"/);

      const finalized = await request(app)
        .post(`/api/orders/${order.id}/finalize_pricing`)
        .send({});
      assert.equal(finalized.status, 422, `answered ${finalized.status}`);
      assert.match(
        finalized.body?.error?.message ?? "",
        /purchase-direction operation and this is a sale order/
      );
    });
  }, { actor: TEST_ACTOR.id, lock: ORDER_LOCK });
});

test("nothing this file did survived the transaction", async () => {
  const [row] = await outside(
    `SELECT o.order_sent, ro.refiner_id AS supplier_id
       FROM orders.orders o
       LEFT JOIN refiners.orders ro ON ro.order_id = o.id
      WHERE o.id = $1`,
    [order.id]
  );
  assert.equal(row.order_sent, order.order_sent, "an order's sent flag was really changed in dev");
  assert.equal(row.supplier_id, order.supplier_id, "an order's supplier was really changed in dev");
});
