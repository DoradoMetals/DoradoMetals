// The tracking pair of PATCH /api/shipments/:id, over real HTTP - a tracking
// number is SHIPMENT data, so its endpoint lives with the parcel (the
// per-resource ruling, 28 August).
//
// WHY THIS FILE EXISTS. The route this operation replaced
// (POST /sales_orders/update_tracking) answered 500 on every call. The
// service awaited shipmentRepo.insertTrackingNumber, which the shipments repo
// has never exported - checked against master as well as this branch - and
// `import * as` makes a missing name `undefined` rather than an import error,
// so nothing failed until the line ran. The PATCH dispatches to the same
// service.updateTracking, so the assertion that the write actually lands is
// exactly as load-bearing as it was.
//
// An admin could not record a tracking number against a sales order at all.
// Found by scripts/lint-namespace-calls.mjs, written after the same class of
// bug was found by hand in features/payments.
//
// This one CAN assert success: unlike update_payment_intent, nothing here
// leaves the process. It writes through shipmentRepo.update, which follows the
// SHIPMENTS_SOURCE switch.
//
// NOTHING IS COMMITTED: shared/testing/pinned-pool.js holds every query in one
// transaction that is rolled back.
import { test, afterAll, beforeAll } from "vitest";
import assert from "node:assert/strict";
import type { PoolClient } from "pg";
import request from "supertest";
import pool from "#db";
import { mockSessions, restoreSessions, as, asAdmin } from "#shared/testing/session.ts";
import { inPinnedTransaction, outside } from "#shared/testing/pinned-pool.ts";
import { LOCKS } from "#shared/testing/locks.ts";

// The tracking write sets the order's tracking_updated flag as well as the
// shipment row, so this file writes orders.orders and must serialise with
// every other file that does - without this it deadlocked in the full run
// and passed alone, the exact failure the locks registry exists for.
const ORDER_LOCK = LOCKS.ORDERS;

await mockSessions();
const { default: app } = await import("#app");

// THE STRUCTURAL SUBSET EACH FIXTURE ACTUALLY HAS, not a row type. These are
// SELECT projections, so declaring them is the honest thing: naming a wider
// row type would claim columns this query does not ask for.
type AdminFixture = { id: string; name: string | null; email: string | null };
type ShipmentFixture = {
  id: string;
  sales_order_id: string | null;
  carrier_id: string | null;
  tracking_number: string | null;
};

let admin: AdminFixture;
let shipment: ShipmentFixture;

beforeAll(async () => {
  admin = (
    await outside<AdminFixture>(
      `SELECT id, name, email FROM exchange.users WHERE role = 'admin' LIMIT 1`
    )
  )[0];
  assert.ok(admin, "dev has no admin user");

  shipment = (
    await outside<ShipmentFixture>(
      `SELECT s.id, f.order_id AS sales_order_id, cs.carrier_id, s.tracking_number
         FROM shipping.shipments s
         JOIN fulfillments.shipments fs ON fs.shipment_id = s.id
         JOIN fulfillments.fulfillments f ON f.id = fs.fulfillment_id
         JOIN orders.orders o ON o.id = f.order_id
         LEFT JOIN shipping.services cs ON cs.id = s.carrier_service_id
        WHERE o.direction = 'sale'
        ORDER BY s.id LIMIT 1`
    )
  )[0];
  assert.ok(shipment, "dev needs a shipment attached to a sales order");
});

afterAll(async () => {
  restoreSessions();
  await pool.end();
});

test("an admin can record a tracking number against a sales order", async () => {
  await inPinnedTransaction(async () => {
    await asAdmin(admin, async () => {
      const res = await request(app)
        .patch(`/api/shipments/${shipment.id}`)
        .send({
          tracking_number: "E2E-TRACK-000001",
          carrier_id: shipment.carrier_id,
        });

      assert.equal(res.status, 200, `answered ${res.status}: ${JSON.stringify(res.body)}`);
      assert.ok(
        !JSON.stringify(res.body ?? "").includes("is not a function"),
        "the handler called something that does not exist"
      );
    });
  }, { lock: ORDER_LOCK });
});

// A 200 alone would pass against a handler that returned early and wrote
// nothing, which is exactly what the broken version could not be distinguished
// from without this.
test("the tracking number actually lands on the shipment", async () => {
  // inPinnedTransaction hands the pinned client to its callback, which is how
  // the read below sees the route's uncommitted write.
  await inPinnedTransaction(async (client: PoolClient) => {
    await asAdmin(admin, async () => {
      await request(app)
        .patch(`/api/shipments/${shipment.id}`)
        .send({
          tracking_number: "E2E-TRACK-000002",
          carrier_id: shipment.carrier_id,
        });

      const { rows } = await client.query(
        `SELECT tracking_number FROM shipping.shipments WHERE id = $1`,
        [shipment.id]
      );
      assert.equal(
        rows[0]?.tracking_number,
        "E2E-TRACK-000002",
        "the route answered but the shipment was not updated"
      );
    });
  }, { lock: ORDER_LOCK });
});
