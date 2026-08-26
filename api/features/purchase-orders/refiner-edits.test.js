// The refiner-side edits and the payout-details read, over real HTTP.
//
// Three more of the routes no test had ever driven - the list that has now
// produced four production defects. These are the figures that decide what the
// REFINER is paid against what the customer was offered: the refiner's own spot
// for a metal on an order, and the refiner's premium on a line.
//
// ALL THREE ARE PURE DATABASE OPERATIONS. Checked before driving them: no
// email, no FedEx, no Stripe.
//
// ONE ROUTE IN THIS FEATURE IS DELIBERATELY NOT DRIVEN. DELETE /purge_cancelled
// is `DELETE FROM exchange.purchase_orders WHERE purchase_order_status =
// 'Cancelled'` - a bulk delete of the live table. A pinned transaction would
// roll it back, and the pin is well proven, but CLAUDE.md's rule about deleting
// is categorical rather than conditional and the value of covering a cleanup
// endpoint does not come close to the cost of being wrong about the harness.
// Recorded in FOLLOWUPS.md.
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
let refinerMetal;
let orderItem;
let payoutOrderId;

before(async () => {
  admin = (
    await outside(`SELECT id, name, email FROM exchange.users WHERE role = 'admin' LIMIT 1`)
  )[0];
  assert.ok(admin, "dev has no admin user");

  refinerMetal = (
    await outside(
      `SELECT purchase_order_id, type FROM exchange.refiner_metals
        WHERE purchase_order_id IS NOT NULL ORDER BY id LIMIT 1`
    )
  )[0];
  assert.ok(refinerMetal, "dev needs a refiner_metals row on a purchase order");

  orderItem = (
    await outside(`SELECT id FROM exchange.purchase_order_items ORDER BY id LIMIT 1`)
  )[0];
  assert.ok(orderItem, "dev needs a purchase order item");

  payoutOrderId = (
    await outside(
      `SELECT order_id FROM exchange.payouts WHERE order_id IS NOT NULL ORDER BY id LIMIT 1`
    )
  )[0]?.order_id;
  assert.ok(payoutOrderId, "dev needs a payout attached to an order");
});

after(async () => {
  restoreSessions();
  await pool.end();
});

test("update_refiner_spot writes the refiner's bid for that metal on that order", async () => {
  await inPinnedTransaction(async (client) => {
    await as({ ...admin, role: "admin" }, async () => {
      const res = await request(app)
        .post("/api/purchase_orders/update_refiner_spot")
        .send({
          spot: {
            purchase_order_id: refinerMetal.purchase_order_id,
            type: refinerMetal.type,
          },
          updated_spot: "1234.56",
        });

      assert.equal(res.status, 200, `answered ${res.status}: ${JSON.stringify(res.body)}`);

      const { rows } = await client.query(
        `SELECT bid_spot FROM exchange.refiner_metals
          WHERE purchase_order_id = $1 AND type = $2`,
        [refinerMetal.purchase_order_id, refinerMetal.type]
      );
      assert.ok(rows.length, "no refiner_metals row matched");
      assert.equal(Number(rows[0].bid_spot), 1234.56, "bid_spot did not change");
    });
  });
});

test("update_refiner_premium writes the premium on that line", async () => {
  await inPinnedTransaction(async (client) => {
    await as({ ...admin, role: "admin" }, async () => {
      const res = await request(app)
        .post("/api/purchase_orders/update_refiner_premium")
        .send({ item_id: orderItem.id, refiner_premium: "0.875" });

      assert.equal(res.status, 200, `answered ${res.status}: ${JSON.stringify(res.body)}`);

      const { rows } = await client.query(
        `SELECT refiner_premium FROM exchange.purchase_order_items WHERE id = $1`,
        [orderItem.id]
      );
      assert.equal(Number(rows[0].refiner_premium), 0.875, "refiner_premium did not change");
    });
  });
});

// THE ONE ENDPOINT ALLOWED TO RETURN FULL BANK DETAILS.
//
// exchange.payouts holds routing and account numbers in PLAINTEXT. Order
// responses carry only last-4; this admin-only route is where the full values
// come from, which is exactly why it is worth knowing it still works.
//
// NOTHING FROM THE BODY IS PRINTED OR INTERPOLATED INTO AN ASSERTION MESSAGE,
// including on failure. A test that dumps the response on a bad day would put a
// customer's bank account into a CI log, which is the thing the standing
// constraint exists to prevent. The assertions are on KEYS and on status.
test("get_payout_details answers with the payout's fields", async () => {
  await inPinnedTransaction(async () => {
    await as({ ...admin, role: "admin" }, async () => {
      const res = await request(app)
        .post("/api/purchase_orders/get_payout_details")
        .send({ order_id: payoutOrderId });

      assert.equal(res.status, 200, `get_payout_details answered ${res.status}`);

      const payout = Array.isArray(res.body) ? res.body[0] : res.body;
      assert.ok(payout && typeof payout === "object", "no payout object came back");

      // Key presence only. Never the values.
      for (const key of ["method", "account_holder_name"]) {
        assert.ok(key in payout, `the payout is missing ${key}`);
      }
    });
  });
});
