// The sale-direction fields of PATCH /api/orders/:id - the supplier-send
// guard stack, over real HTTP.
//
// The dispatches themselves are covered where they always were: replay.test.js
// (status, refusals to a customer), update-tracking.test.js (the tracking
// write landing). This file owns what the consolidation must NOT have lost:
// the guards inside sendOrderToSupplier. That pipeline attaches a supplier,
// creates an outbound shipment, and emails a refiner their copy of the order -
// so its refusals are the difference between declining and starting that
// sequence against nothing. Each was written against a real defect
// (service.ts's own comments tell the stories); a consolidation that dropped
// one would keep every other test green.
//
// All three refusals fire BEFORE the transaction and BEFORE any email, which
// is what makes them safe to drive over HTTP: a refused send writes nothing
// and mails nothing. The successful send is deliberately NOT driven here - it
// emails a refiner, and the shared transport refuses to exist during a test
// run - and stays covered at the service level with a recorder transport
// (service.test.js).
//
// NOTHING IS COMMITTED - the pool is pinned to a rolled-back transaction, and
// the fixture edits (a nulled refiner email, a cleared order_sent) live inside
// it too.
import test, { after, before } from "node:test";
import assert from "node:assert/strict";
import type { PoolClient } from "pg";
import request from "supertest";
import pool from "#db";
import { mockSessions, restoreSessions, as, asAdmin } from "#shared/testing/session.ts";
import { inPinnedTransaction, outside } from "#shared/testing/pinned-pool.ts";
import { LOCKS } from "#shared/testing/locks.ts";

const ORDER_LOCK = LOCKS.ORDERS;

await mockSessions();
const { default: app } = await import("#app");

// THE STRUCTURAL SUBSET EACH FIXTURE ACTUALLY HAS. These are SELECT
// projections, not table rows - naming a row type would claim columns the
// query never asked for.
type UserFixture = { id: string; name: string | null; email: string | null };
type SalesOrderFixture = { id: string; order_sent: boolean | null; supplier_id: string | null };
type RefinerFixture = { id: string; organization_id: string };

let admin: UserFixture;
let order: SalesOrderFixture; // a sales order WITH an address - the pipeline refuses one without
let refiners: RefinerFixture[]; // dev holds two

before(async () => {
  admin = (
    await outside<UserFixture>(`SELECT id, name, email FROM exchange.users WHERE role = 'admin' LIMIT 1`)
  )[0];
  assert.ok(admin, "dev has no admin user");

  order = (
    await outside<SalesOrderFixture>(
      `SELECT id, order_sent, supplier_id FROM exchange.sales_orders
        WHERE address_id IS NOT NULL
        ORDER BY created_at ASC, id ASC LIMIT 1`
    )
  )[0];
  assert.ok(order, "dev has no sales order with an address");

  refiners = await outside<RefinerFixture>(
    `SELECT r.id, r.organization_id FROM refiners.refiners r
      WHERE r.organization_id IS NOT NULL ORDER BY r.id`
  );
  assert.ok(refiners.length >= 1, "dev has no refiner to send to");
});

after(async () => {
  restoreSessions();
  await pool.end();
});

test("an order that does not exist is refused before anything runs", async () => {
  await inPinnedTransaction(async () => {
    await asAdmin(admin, async () => {
      const res = await request(app)
        .patch("/api/orders/00000000-0000-4000-8000-000000000000")
        .send({ supplier: { supplier_id: refiners[0].id, send: true } });
      assert.equal(res.status, 404, `answered ${res.status} against a nonexistent order`);
    });
  }, { lock: ORDER_LOCK });
});

test("a refiner with no email is refused, and nothing is written", async () => {
  await inPinnedTransaction(async (client: PoolClient) => {
    await asAdmin(admin, async () => {
      // The Dillion Gage shape, made deterministic: inside the rolled-back
      // transaction this refiner has no email, whatever dev holds today. The
      // order is unsent, so the 409 guard cannot answer first - in BOTH
      // schemas, because the read side serves orders.orders while exchange
      // still dual-writes.
      await client.query(
        `UPDATE organizations.organizations SET email = NULL WHERE id = $1`,
        [refiners[0].organization_id]
      );
      await client.query(
        `UPDATE exchange.sales_orders SET order_sent = false, supplier_id = NULL WHERE id = $1`,
        [order.id]
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
          `SELECT count(*)::int AS n FROM exchange.shipments WHERE sales_order_id = $1`,
          [order.id]
        )
      ).rows[0].n;

      const res = await request(app)
        .patch(`/api/orders/${order.id}`)
        .send({ supplier: { supplier_id: refiners[0].id, send: true } });

      assert.equal(res.status, 422, `answered ${res.status}: ${JSON.stringify(res.body)}`);

      // Refused means refused: no supplier attached, not marked sent, no
      // outbound shipment created - checked in the schema the reads serve AND
      // the one the writes still mirror to.
      const after = (
        await client.query(
          `SELECT order_sent, supplier_id FROM exchange.sales_orders WHERE id = $1`,
          [order.id]
        )
      ).rows[0];
      assert.equal(after.order_sent, false, "a refused send still marked the order sent");
      assert.equal(after.supplier_id, null, "a refused send still attached the supplier");
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
          `SELECT count(*)::int AS n FROM exchange.shipments WHERE sales_order_id = $1`,
          [order.id]
        )
      ).rows[0].n;
      assert.equal(shipmentsAfter, shipmentsBefore, "a refused send still created a shipment");
    });
  }, { lock: ORDER_LOCK });
});

test("a sent order cannot be moved to a different refiner", async (t) => {
  if (refiners.length < 2) {
    t.skip("dev has only one refiner, so there is no different one to refuse");
    return;
  }
  await inPinnedTransaction(async (client: PoolClient) => {
    await asAdmin(admin, async () => {
      // Already sent to refiner A, inside the rolled-back transaction - in
      // both schemas, since the read side serves orders.orders.
      await client.query(
        `UPDATE exchange.sales_orders SET order_sent = true, supplier_id = $2 WHERE id = $1`,
        [order.id, refiners[0].id]
      );
      await client.query(
        `UPDATE orders.orders SET order_sent = true WHERE id = $1`,
        [order.id]
      );
      await client.query(
        `UPDATE refiners.orders SET refiner_id = $2 WHERE order_id = $1`,
        [order.id, refiners[0].id]
      );

      const res = await request(app)
        .patch(`/api/orders/${order.id}`)
        .send({ supplier: { supplier_id: refiners[1].id, send: true } });

      assert.equal(res.status, 409, `answered ${res.status}: ${JSON.stringify(res.body)}`);

      const after = (
        await client.query(`SELECT refiner_id FROM refiners.orders WHERE order_id = $1`, [order.id])
      ).rows[0];
      assert.equal(after.refiner_id, refiners[0].id, "the order moved to the second refiner");
    });
  }, { lock: ORDER_LOCK });
});

test("a supplier document without send: true is refused by name", async () => {
  await inPinnedTransaction(async () => {
    await asAdmin(admin, async () => {
      const res = await request(app)
        .patch(`/api/orders/${order.id}`)
        .send({ supplier: { supplier_id: refiners[0].id, send: false } });
      assert.equal(res.status, 400, `answered ${res.status}`);
      assert.match(res.body?.error?.message ?? "", /"supplier"/);
    });
  }, { lock: ORDER_LOCK });
});

test("a field the PATCH does not have - and a wrong-direction field - refuse by name", async () => {
  await inPinnedTransaction(async () => {
    await asAdmin(admin, async () => {
      // tracking left for the shipments endpoint; it is not a field at all.
      const tracked = await request(app)
        .patch(`/api/orders/${order.id}`)
        .send({ tracking: { shipment_id: "x", tracking_number: "y", carrier_id: "z" } });
      assert.equal(tracked.status, 400, `answered ${tracked.status}`);
      assert.match(tracked.body?.error?.message ?? "", /"tracking"/);

      // finalize_pricing is a purchase-direction operation; direction is
      // data, and the refusal says which direction this order is.
      const finalized = await request(app)
        .patch(`/api/orders/${order.id}`)
        .send({ finalize_pricing: true });
      assert.equal(finalized.status, 400, `answered ${finalized.status}`);
      assert.match(finalized.body?.error?.message ?? "", /"finalize_pricing".*sale/);
    });
  }, { lock: ORDER_LOCK });
});

test("nothing this file did survived the transaction", async () => {
  const [{ order_sent, supplier_id }] = await outside(
    `SELECT order_sent, supplier_id FROM exchange.sales_orders WHERE id = $1`,
    [order.id]
  );
  assert.equal(order_sent, order.order_sent, "an order's sent flag was really changed in dev");
  assert.equal(supplier_id, order.supplier_id, "an order's supplier was really changed in dev");
});
