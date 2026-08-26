// The admin money edits on a purchase order, over real HTTP.
//
// WHY THIS FILE EXISTS. These six routes were among the 46 that no test had
// ever driven, and that list has now produced four defects: two routes dead
// since December, a credit ledger recording a different number from the credit
// it explained, and this batch is the rest of the same seam.
//
// They are the figures that decide what the business pays a customer and what
// it keeps: the shipping charged, the payout fee, the refiner's fee, the pool
// ounces deducted and the remediation. A structural break in any of them looks
// exactly like the two that were found - a 500 nobody notices because no
// browser calls it during a deploy check.
//
// EVERY ONE IS A PURE DATABASE WRITE. No email, no FedEx, no Stripe. That is
// why this batch is safe to drive and the rest of the 46 are not; see
// FOLLOWUPS.md for which and why.
//
// EACH TEST ASSERTS THE VALUE LANDS, not that the route answered 200. A handler
// that returns early and writes nothing answers 200 too - which is precisely how
// the add_funds test passed against broken code until it counted rows.
//
// NOTHING IS COMMITTED. shared/testing/pinned-pool.js holds every query in one
// transaction that is rolled back.
import test, { after, before } from "node:test";
import assert from "node:assert/strict";
import request from "supertest";
import pool from "#db";
import { mockSessions, restoreSessions, as } from "#shared/testing/session.js";
import { inPinnedTransaction, outside } from "#shared/testing/pinned-pool.js";

await mockSessions();
const { default: app } = await import("#app");

let admin;
let orderId;
let orderWithShipment;
let orderWithPayout;

before(async () => {
  admin = (
    await outside(`SELECT id, name, email FROM exchange.users WHERE role = 'admin' LIMIT 1`)
  )[0];
  assert.ok(admin, "dev has no admin user");

  orderId = (await outside(`SELECT id FROM exchange.purchase_orders ORDER BY id LIMIT 1`))[0]?.id;
  assert.ok(orderId, "dev has no purchase order");

  orderWithShipment = (
    await outside(
      `SELECT purchase_order_id AS id FROM exchange.shipments
        WHERE purchase_order_id IS NOT NULL ORDER BY id LIMIT 1`
    )
  )[0]?.id;
  assert.ok(orderWithShipment, "dev needs a purchase order with a shipment");

  orderWithPayout = (
    await outside(
      `SELECT order_id AS id FROM exchange.payouts WHERE order_id IS NOT NULL ORDER BY id LIMIT 1`
    )
  )[0]?.id;
  assert.ok(orderWithPayout, "dev needs a purchase order with a payout");
});

after(async () => {
  restoreSessions();
  await pool.end();
});

// The four that write a column on the order itself. Same shape, so they are
// declared rather than written out five times - the body key and the column are
// the only difference, and getting THOSE wrong is the bug being looked for.
const ORDER_EDITS = [
  ["update_shipping_actual", "shipping_fee_actual", "12.34"],
  ["update_refiner_fee", "refiner_fee", "23.45"],
  ["update_pool_oz_deducted", "pool_oz_deducted", "1.2345"],
  ["update_pool_remediation", "pool_remediation", "34.56"],
];

for (const [route, column, value] of ORDER_EDITS) {
  test(`${route} writes ${column} to the order`, async () => {
    await inPinnedTransaction(async (client) => {
      await as({ ...admin, role: "admin" }, async () => {
        const res = await request(app)
          .post(`/api/purchase_orders/${route}`)
          .send({ purchase_order_id: orderId, [column]: value });

        assert.equal(res.status, 200, `answered ${res.status}: ${JSON.stringify(res.body)}`);

        const { rows } = await client.query(
          `SELECT ${column} AS v FROM exchange.purchase_orders WHERE id = $1`,
          [orderId]
        );
        assert.equal(
          Number(rows[0].v),
          Number(value),
          `${route} answered 200 but ${column} is ${rows[0].v}`
        );
      });
    });
  });
}

// Writes exchange.shipments.net_charge, keyed on the ORDER not the shipment.
test("edit_shipping_charge writes net_charge on the order's shipment", async () => {
  await inPinnedTransaction(async (client) => {
    await as({ ...admin, role: "admin" }, async () => {
      const res = await request(app)
        .post("/api/purchase_orders/edit_shipping_charge")
        .send({ order_id: orderWithShipment, shipping_charge: "45.67" });

      assert.equal(res.status, 200, `answered ${res.status}: ${JSON.stringify(res.body)}`);

      const { rows } = await client.query(
        `SELECT net_charge FROM exchange.shipments WHERE purchase_order_id = $1`,
        [orderWithShipment]
      );
      assert.ok(rows.length, "no shipment row for that order");
      assert.equal(Number(rows[0].net_charge), 45.67, "net_charge did not change");
    });
  });
});

// Writes exchange.payouts.cost. The service parameter is `payout_charge` while
// the repo's is `shipping_charge` - a rename in the middle, which is the kind
// of thing that silently writes undefined if either side moves.
test("edit_payout_charge writes cost on the order's payout", async () => {
  await inPinnedTransaction(async (client) => {
    await as({ ...admin, role: "admin" }, async () => {
      const res = await request(app)
        .post("/api/purchase_orders/edit_payout_charge")
        .send({ order_id: orderWithPayout, payout_charge: "56.78" });

      assert.equal(res.status, 200, `answered ${res.status}: ${JSON.stringify(res.body)}`);

      const { rows } = await client.query(
        `SELECT cost FROM exchange.payouts WHERE order_id = $1`,
        [orderWithPayout]
      );
      assert.ok(rows.length, "no payout row for that order");
      assert.equal(Number(rows[0].cost), 56.78, "cost did not change");
    });
  });
});
