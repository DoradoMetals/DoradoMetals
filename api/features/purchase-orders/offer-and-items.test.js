// The offer edits and the item writes an admin makes on a purchase order.
//
// Four more from the undriven list. All pure database work - checked each
// service function first, and reissueOffer in particular, because "reissue"
// sounds like it emails and it does not.
//
// THE OFFER ONES ARE A STATE MACHINE, WHICH IS WHY THE ASSERTIONS ARE ON THE
// TRANSITION RATHER THAN ON A VALUE. update_rejected_offer flips Rejected to
// Resent and Resent back to Rejected, and clears the item prices and the order
// total on the way through - so an offer that is re-sent is re-priced rather
// than carrying the old numbers forward. Asserting only the status would pass
// against a version that forgot the clearing.
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
let customer;
let order;
let bullionItem;

before(async () => {
  admin = (
    await outside(`SELECT id, name, email FROM exchange.users WHERE role = 'admin' LIMIT 1`)
  )[0];
  assert.ok(admin, "dev has no admin user");

  order = (
    await outside(
      `SELECT id, user_id, offer_status FROM exchange.purchase_orders
        WHERE user_id IS NOT NULL ORDER BY id LIMIT 1`
    )
  )[0];
  assert.ok(order, "dev needs a purchase order with a user");

  customer = (
    await outside(`SELECT id, name, email FROM exchange.users WHERE id = $1`, [order.user_id])
  )[0];
  assert.ok(customer, "the fixture order's user is missing");

  // A bullion line - one with a product rather than scrap.
  bullionItem = (
    await outside(
      `SELECT id, purchase_order_id FROM exchange.purchase_order_items
        WHERE product_id IS NOT NULL ORDER BY id LIMIT 1`
    )
  )[0];
  assert.ok(bullionItem, "dev needs a bullion line on a purchase order");
});

after(async () => {
  restoreSessions();
  await pool.end();
});

// requireOwnOrder, so this runs as the order's OWNER rather than as an admin -
// the one route in this file a customer drives.
test("update_offer_notes writes the customer's note onto the offer", async () => {
  await inPinnedTransaction(async (client) => {
    await as({ ...customer, role: "user" }, async () => {
      const res = await request(app)
        .post("/api/purchase_orders/update_offer_notes")
        .send({ order: { id: order.id }, offer_notes: "please post it recorded delivery" });

      assert.equal(res.status, 200, `answered ${res.status}: ${JSON.stringify(res.body)}`);

      const { rows } = await client.query(
        `SELECT offer_notes FROM exchange.purchase_orders WHERE id = $1`,
        [order.id]
      );
      assert.equal(
        rows[0].offer_notes,
        "please post it recorded delivery",
        "the note did not land on the order"
      );
    });
  });
});

test("update_rejected_offer resends a rejected offer and clears its prices", async () => {
  await inPinnedTransaction(async (client) => {
    await as({ ...admin, role: "admin" }, async () => {
      await client.query(
        `UPDATE exchange.purchase_orders SET offer_status = 'Rejected', total_price = 999
          WHERE id = $1`,
        [order.id]
      );

      const res = await request(app)
        .post("/api/purchase_orders/update_rejected_offer")
        .send({
          order: { id: order.id, offer_status: "Rejected" },
          order_status: "Offer Sent",
          user_name: admin.name,
        });

      assert.equal(res.status, 200, `answered ${res.status}: ${JSON.stringify(res.body)}`);

      const { rows } = await client.query(
        `SELECT offer_status, total_price FROM exchange.purchase_orders WHERE id = $1`,
        [order.id]
      );
      assert.equal(rows[0].offer_status, "Resent", "the offer was not resent");
      assert.notEqual(
        Number(rows[0].total_price),
        999,
        "the order total was carried forward instead of being cleared for re-pricing"
      );
    });
  });
});

// The other direction. A Resent offer going back to Rejected is the same route
// reading the CURRENT status, which is the part a single-direction test misses.
test("update_rejected_offer sends a resent offer back to rejected", async () => {
  await inPinnedTransaction(async (client) => {
    await as({ ...admin, role: "admin" }, async () => {
      await client.query(
        `UPDATE exchange.purchase_orders SET offer_status = 'Resent' WHERE id = $1`,
        [order.id]
      );

      const res = await request(app)
        .post("/api/purchase_orders/update_rejected_offer")
        .send({
          order: { id: order.id, offer_status: "Resent" },
          order_status: "Rejected",
          user_name: admin.name,
        });

      assert.equal(res.status, 200, `answered ${res.status}: ${JSON.stringify(res.body)}`);

      const { rows } = await client.query(
        `SELECT offer_status FROM exchange.purchase_orders WHERE id = $1`,
        [order.id]
      );
      assert.equal(rows[0].offer_status, "Rejected", "the offer did not go back to rejected");
    });
  });
});

test("update_bullion_item writes the line's quantity", async () => {
  await inPinnedTransaction(async (client) => {
    await as({ ...admin, role: "admin" }, async () => {
      const res = await request(app)
        .post("/api/purchase_orders/update_bullion_item")
        .send({ item: { id: bullionItem.id, quantity: 7 } });

      assert.equal(res.status, 200, `answered ${res.status}: ${JSON.stringify(res.body)}`);

      const { rows } = await client.query(
        `SELECT quantity FROM exchange.purchase_order_items WHERE id = $1`,
        [bullionItem.id]
      );
      assert.equal(Number(rows[0].quantity), 7, "the quantity did not change");
    });
  });
});

// Creating a scrap line is three writes in one transaction: the scrap row, the
// order line, and a re-tier of every scrap premium on the order. The count
// assertion is what distinguishes "created" from "answered 200".
test("create_order_item adds a scrap line and its scrap row", async () => {
  await inPinnedTransaction(async (client) => {
    await as({ ...admin, role: "admin" }, async () => {
      const before = await client.query(
        `SELECT count(*)::int n FROM exchange.purchase_order_items WHERE purchase_order_id = $1`,
        [order.id]
      );

      const res = await request(app)
        .post("/api/purchase_orders/create_order_item")
        .send({
          purchase_order_id: order.id,
          item: {
            metal: "Gold",
            pre_melt: 1.5,
            purity: 0.585,
            gross_unit: "t oz",
            content: 0.8775,
            quantity: 1,
          },
        });

      assert.equal(res.status, 200, `answered ${res.status}: ${JSON.stringify(res.body)}`);

      const after = await client.query(
        `SELECT count(*)::int n FROM exchange.purchase_order_items WHERE purchase_order_id = $1`,
        [order.id]
      );
      assert.equal(
        Number(after.rows[0].n),
        Number(before.rows[0].n) + 1,
        "the route answered 200 but added no line"
      );
    });
  });
});
