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
import request from "supertest";
import pool from "#db";
import { mockSessions, restoreSessions, as } from "#shared/testing/session.ts";
import { inPinnedTransaction, outside } from "#shared/testing/pinned-pool.ts";

await mockSessions();
const { default: app } = await import("#app");

let admin;
let shipment; // a purchase-order shipment: id + its order
let payout; // a payout row: id + its order

before(async () => {
  admin = (
    await outside(`SELECT id, name, email FROM exchange.users WHERE role = 'admin' LIMIT 1`)
  )[0];
  assert.ok(admin, "dev has no admin user");

  shipment = (
    await outside(
      `SELECT id, purchase_order_id FROM exchange.shipments
        WHERE purchase_order_id IS NOT NULL ORDER BY id LIMIT 1`
    )
  )[0];
  assert.ok(shipment, "dev needs a purchase order with a shipment");

  payout = (
    await outside(
      `SELECT id, order_id FROM exchange.payouts WHERE order_id IS NOT NULL ORDER BY id LIMIT 1`
    )
  )[0];
  assert.ok(payout, "dev needs a payout attached to an order");
});

after(async () => {
  restoreSessions();
  await pool.end();
});

// Writes exchange.shipments.net_charge. The write is ORDER-scoped by design -
// the legacy statement was `WHERE purchase_order_id = $1`, every parcel on
// the order - and the shipment id ADDRESSES the resource, as the endpoint's
// header states.
test("shipping_charge writes net_charge on the order's shipment", async () => {
  await inPinnedTransaction(async (client) => {
    await as({ ...admin, role: "admin" }, async () => {
      const res = await request(app)
        .patch(`/api/shipments/${shipment.id}`)
        .send({ shipping_charge: 45.67 });

      assert.equal(res.status, 200, `answered ${res.status}: ${JSON.stringify(res.body)}`);

      const { rows } = await client.query(
        `SELECT net_charge FROM exchange.shipments WHERE id = $1`,
        [shipment.id]
      );
      assert.equal(Number(rows[0].net_charge), 45.67, "net_charge did not change");
    });
  });
});

// Writes exchange.purchase_orders.shipping_fee_actual - an ORDER column
// reached through the parcel, which the endpoint's keying note owns up to.
test("shipping_actual lands on the shipment's order", async () => {
  await inPinnedTransaction(async (client) => {
    await as({ ...admin, role: "admin" }, async () => {
      const res = await request(app)
        .patch(`/api/shipments/${shipment.id}`)
        .send({ shipping_actual: 12.34 });

      assert.equal(res.status, 200, `answered ${res.status}: ${JSON.stringify(res.body)}`);

      const { rows } = await client.query(
        `SELECT shipping_fee_actual FROM exchange.purchase_orders WHERE id = $1`,
        [shipment.purchase_order_id]
      );
      assert.equal(Number(rows[0].shipping_fee_actual), 12.34, "the actual cost did not land");
    });
  });
});

// Writes exchange.payouts.cost. The service parameter is `payout_charge` while
// the repo's is `shipping_charge` - a rename in the middle, which is the kind
// of thing that silently writes undefined if either side moves.
test("cost writes the payout's cost", async () => {
  await inPinnedTransaction(async (client) => {
    await as({ ...admin, role: "admin" }, async () => {
      const res = await request(app)
        .patch(`/api/payouts/${payout.id}`)
        .send({ cost: 56.78 });

      assert.equal(res.status, 200, `answered ${res.status}: ${JSON.stringify(res.body)}`);

      const { rows } = await client.query(
        `SELECT cost FROM exchange.payouts WHERE order_id = $1`,
        [payout.order_id]
      );
      assert.ok(rows.length, "no payout row for that order");
      assert.equal(Number(rows[0].cost), 56.78, "cost did not change");
    });
  });
});

test("method writes the payout's method, and the response is a bare success", async () => {
  await inPinnedTransaction(async (client) => {
    await as({ ...admin, role: "admin" }, async () => {
      const res = await request(app)
        .patch(`/api/payouts/${payout.id}`)
        .send({ method: "ACH" });

      assert.equal(res.status, 200, `answered ${res.status}: ${JSON.stringify(res.body)}`);
      // THE RADIOACTIVE RULE: the response must never be the row - a payout
      // row is one projection slip away from a bank number.
      assert.deepEqual(res.body, { success: true }, "the payout PATCH answered with data");

      const { rows } = await client.query(
        `SELECT method FROM exchange.payouts WHERE id = $1`,
        [payout.id]
      );
      assert.equal(rows[0].method, "ACH", "the method did not change");
    });
  });
});

// The unknown-field refusal, on both endpoints - never a silent drop, and
// nothing beside a refused field executes.
test("an unknown field refuses by name on both endpoints", async () => {
  await inPinnedTransaction(async (client) => {
    await as({ ...admin, role: "admin" }, async () => {
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
