// POST /api/sales_orders/update_tracking, over real HTTP.
//
// WHY THIS FILE EXISTS. The route answered 500 on every call. The service
// awaited shipmentRepo.insertTrackingNumber, which the shipments repo has never
// exported - checked against master as well as this branch - and `import * as`
// makes a missing name `undefined` rather than an import error, so nothing
// failed until the line ran.
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
import test, { after, before } from "node:test";
import assert from "node:assert/strict";
import request from "supertest";
import pool from "#db";
import { mockSessions, restoreSessions, as } from "#shared/testing/session.ts";
import { inPinnedTransaction, outside } from "#shared/testing/pinned-pool.ts";

await mockSessions();
const { default: app } = await import("#app");

let admin;
let shipment;

before(async () => {
  admin = (
    await outside(`SELECT id, name, email FROM exchange.users WHERE role = 'admin' LIMIT 1`)
  )[0];
  assert.ok(admin, "dev has no admin user");

  shipment = (
    await outside(
      `SELECT id, sales_order_id, carrier_id, tracking_number
         FROM exchange.shipments
        WHERE sales_order_id IS NOT NULL
        ORDER BY id LIMIT 1`
    )
  )[0];
  assert.ok(shipment, "dev needs a shipment attached to a sales order");
});

after(async () => {
  restoreSessions();
  await pool.end();
});

test("an admin can record a tracking number against a sales order", async () => {
  await inPinnedTransaction(async () => {
    await as({ ...admin, role: "admin" }, async () => {
      const res = await request(app)
        .post("/api/sales_orders/update_tracking")
        .send({
          order_id: shipment.sales_order_id,
          shipment_id: shipment.id,
          tracking_number: "E2E-TRACK-000001",
          carrier_id: shipment.carrier_id,
        });

      assert.equal(res.status, 200, `answered ${res.status}: ${JSON.stringify(res.body)}`);
      assert.ok(
        !JSON.stringify(res.body ?? "").includes("is not a function"),
        "the handler called something that does not exist"
      );
    });
  });
});

// A 200 alone would pass against a handler that returned early and wrote
// nothing, which is exactly what the broken version could not be distinguished
// from without this.
test("the tracking number actually lands on the shipment", async () => {
  // inPinnedTransaction hands the pinned client to its callback, which is how
  // the read below sees the route's uncommitted write.
  await inPinnedTransaction(async (client) => {
    await as({ ...admin, role: "admin" }, async () => {
      await request(app)
        .post("/api/sales_orders/update_tracking")
        .send({
          order_id: shipment.sales_order_id,
          shipment_id: shipment.id,
          tracking_number: "E2E-TRACK-000002",
          carrier_id: shipment.carrier_id,
        });

      const { rows } = await client.query(
        `SELECT tracking_number FROM exchange.shipments WHERE id = $1`,
        [shipment.id]
      );
      assert.equal(
        rows[0]?.tracking_number,
        "E2E-TRACK-000002",
        "the route answered but the shipment was not updated"
      );
    });
  });
});
