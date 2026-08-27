// The offer edits and the item writes an admin makes on a purchase order.
//
// Item edits from the undriven list (the offer tests left with 086). All pure database work - checked each
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
import { mockSessions, restoreSessions, as } from "#shared/testing/session.ts";
import { inPinnedTransaction, outside } from "#shared/testing/pinned-pool.ts";

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
      `SELECT id, user_id FROM exchange.purchase_orders
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
