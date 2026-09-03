// The admin money edits around a purchase order, over real HTTP - on the
// resources that own them since the per-resource re-slice (28 August).
//
// WHY THIS FILE EXISTS. These edits were among the 46 routes that no test had
// ever driven, and that list produced four defects: two routes dead since
// December, a credit ledger recording a different number from the credit it
// explained, and this batch is the rest of the same seam. They are the
// figures that decide what the business pays a customer and what it keeps.
//
// The surface now: a parcel's money is PATCH /api/shipments/:id (addressed by
// the shipment id the order wire serves), a payout's cost is
// PATCH /api/payouts/:id (the payout id, same wire). The pool values and the
// refiner fee are refiner-ENGAGEMENT facts and live with the refiners feature
// - see refiner-edits.test.js. Every dispatch is the same service the old
// route called.
//
// EACH TEST ASSERTS THE VALUE LANDS, not that the route answered 200. A
// handler that returns early and writes nothing answers 200 too - which is
// precisely how the add_funds test passed against broken code until it
// counted rows.
//
// NOTHING IS COMMITTED. shared/testing/pinned-pool.js holds every query in one
// transaction that is rolled back.
import test, { after, before } from "node:test";
import assert from "node:assert/strict";
import type { PoolClient } from "pg";
import request from "supertest";
import pool from "#db";
import { mockSessions, restoreSessions, as, asAdmin } from "#shared/testing/session.ts";
import { inPinnedTransaction, outside } from "#shared/testing/pinned-pool.ts";

await mockSessions();
const { default: app } = await import("#app");

// THE STRUCTURAL SUBSET EACH FIXTURE ACTUALLY HAS. These are SELECT
// projections, not table rows - naming a row type would claim columns the
// query never asked for.
type UserFixture = { id: string; name: string | null; email: string | null };
type ShipmentFixture = { id: string; purchase_order_id: string };
type PayoutFixture = { id: string; order_id: string };

let admin: UserFixture;
let shipment: ShipmentFixture; // a purchase-order shipment: id + its order
let payout: PayoutFixture; // a payout row: id + its order

before(async () => {
  admin = (
    await outside<UserFixture>(`SELECT id, name, email FROM exchange.users WHERE role = 'admin' LIMIT 1`)
  )[0];
  assert.ok(admin, "dev has no admin user");

  shipment = (
    await outside<ShipmentFixture>(
      `SELECT s.id, f.order_id AS purchase_order_id
         FROM shipping.shipments s
         JOIN fulfillments.shipments fs ON fs.shipment_id = s.id
         JOIN fulfillments.fulfillments f ON f.id = fs.fulfillment_id
         JOIN orders.orders o ON o.id = f.order_id
        WHERE o.direction = 'purchase' ORDER BY s.id LIMIT 1`
    )
  )[0];
  assert.ok(shipment, "dev needs a purchase order with a shipment");

  // A payout is an orders.transactions row with an account link (099); the
  // PATCH is keyed by the details id under the new flow.
  payout = (
    await outside<PayoutFixture>(
      `SELECT t.payout_details_id AS id, t.order_id
         FROM orders.transactions t
         JOIN orders.orders o ON o.id = t.order_id
        WHERE t.payout_details_id IS NOT NULL AND o.direction = 'purchase'
        ORDER BY t.order_id LIMIT 1`
    )
  )[0];
  assert.ok(payout, "dev needs a payout account linked to an order");
});

after(async () => {
  restoreSessions();
  await pool.end();
});

// Writes shipping.shipments.cost. The write is ORDER-scoped by design - every
// parcel on the order - and the shipment id ADDRESSES the resource, as the
// endpoint's header states.
test("shipping_charge writes net_charge on the order's shipment", async () => {
  await inPinnedTransaction(async (client: PoolClient) => {
    await asAdmin(admin, async () => {
      const res = await request(app)
        .patch(`/api/shipments/${shipment.id}`)
        .send({ shipping_charge: 45.67 });

      assert.equal(res.status, 200, `answered ${res.status}: ${JSON.stringify(res.body)}`);

      const { rows } = await client.query(
        `SELECT cost FROM shipping.shipments WHERE id = $1`,
        [shipment.id]
      );
      assert.equal(Number(rows[0].cost), 45.67, "the charge did not change");
    });
  });
});

// Writes orders.transactions.shipping_fee_actual - an ORDER column reached
// through the parcel, which the endpoint's keying note owns up to.
test("shipping_actual lands on the shipment's order", async () => {
  await inPinnedTransaction(async (client: PoolClient) => {
    await asAdmin(admin, async () => {
      const res = await request(app)
        .patch(`/api/shipments/${shipment.id}`)
        .send({ shipping_actual: 12.34 });

      assert.equal(res.status, 200, `answered ${res.status}: ${JSON.stringify(res.body)}`);

      const { rows } = await client.query(
        `SELECT shipping_fee_actual FROM orders.transactions WHERE order_id = $1`,
        [shipment.purchase_order_id]
      );
      assert.equal(Number(rows[0].shipping_fee_actual), 12.34, "the actual cost did not land");
    });
  });
});

// Writes orders.transactions.payout_fee - exchange kept this on the payout
// row as `cost`, and 073 split the per-order fee off the bank account.
test("cost writes the payout's cost", async () => {
  await inPinnedTransaction(async (client: PoolClient) => {
    await asAdmin(admin, async () => {
      const res = await request(app)
        .patch(`/api/payouts/${payout.id}`)
        .send({ cost: 56.78 });

      assert.equal(res.status, 200, `answered ${res.status}: ${JSON.stringify(res.body)}`);

      const { rows } = await client.query(
        `SELECT payout_fee FROM orders.transactions WHERE order_id = $1`,
        [payout.order_id]
      );
      assert.ok(rows.length, "no money row for that order");
      assert.equal(Number(rows[0].payout_fee), 56.78, "cost did not change");
    });
  });
});

test("method writes the payout's method, and the response is a bare success", async () => {
  await inPinnedTransaction(async (client: PoolClient) => {
    await asAdmin(admin, async () => {
      const res = await request(app)
        .patch(`/api/payouts/${payout.id}`)
        .send({ method: "ACH" });

      assert.equal(res.status, 200, `answered ${res.status}: ${JSON.stringify(res.body)}`);
      // THE RADIOACTIVE RULE: the response must never be the row - a payout
      // row is one projection slip away from a bank number.
      assert.deepEqual(res.body, { success: true }, "the payout PATCH answered with data");

      const { rows } = await client.query(
        `SELECT m.type
           FROM payments.details d
           JOIN payments.methods m ON m.id = d.method_id
          WHERE d.id = $1`,
        [payout.id]
      );
      assert.equal(rows[0].type, "ACH", "the method did not change");
    });
  });
});

// The unknown-field refusal, on both endpoints - never a silent drop, and
// nothing beside a refused field executes.
test("an unknown field refuses by name on both endpoints", async () => {
  await inPinnedTransaction(async (client: PoolClient) => {
    await asAdmin(admin, async () => {
      const ship = await request(app)
        .patch(`/api/shipments/${shipment.id}`)
        .send({ shipping_charge: 11.11, pool_oz_deducted: 9 });
      assert.equal(ship.status, 400, `answered ${ship.status}`);
      assert.match(ship.body?.error?.message ?? "", /"pool_oz_deducted"/);

      const charge = await client.query(
        `SELECT net_charge FROM exchange.shipments WHERE id = $1`,
        [shipment.id]
      );
      assert.notEqual(
        Number(charge.rows[0].net_charge),
        11.11,
        "the valid half of a refused document was executed"
      );

      const pay = await request(app)
        .patch(`/api/payouts/${payout.id}`)
        .send({ account_number: "12345678" });
      assert.equal(pay.status, 400, `answered ${pay.status}`);
      assert.match(pay.body?.error?.message ?? "", /"account_number"/);
    });
  });
});
