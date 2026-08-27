// Crediting a customer's account from a purchase order, over real HTTP.
//
// WHY THIS FILE EXISTS. POST /api/purchase_orders/add_funds_to_account was one
// of the 46 mounted routes never driven by any test, and reading it showed the
// balance and the ledger entry explaining it were computed two different ways:
//
//   addFunds(user, order.total_price)                    <- the movement
//   addTransactionLog(..., calculateTotalPrice(order, spots))  <- the record
//
// with `spots` arriving in the request body. In production all NINE Credit
// entries differ from the total_price of the order they name, three materially.
//
// The assertion below is that they agree - the balance moved by exactly what the
// ledger says. That is the property, not a particular number, so it survives the
// order fixture changing.
//
// NOTHING IS COMMITTED. shared/testing/pinned-pool.js holds every query in one
// transaction that is rolled back, and this suite writes to a customer's credit
// balance, so that matters more here than usual.
import test, { after, before } from "node:test";
import assert from "node:assert/strict";
import request from "supertest";
import pool from "#db";
import { mockSessions, restoreSessions, as } from "#shared/testing/session.ts";
import { inPinnedTransaction, outside } from "#shared/testing/pinned-pool.ts";

await mockSessions();
const { default: app } = await import("#app");

let admin;
let order;

before(async () => {
  admin = (
    await outside(`SELECT id, name, email FROM exchange.users WHERE role = 'admin' LIMIT 1`)
  )[0];
  assert.ok(admin, "dev has no admin user");

  order = (
    await outside(
      `SELECT po.id, po.user_id, po.total_price
         FROM exchange.purchase_orders po
        WHERE po.user_id IS NOT NULL AND po.total_price IS NOT NULL
        ORDER BY po.id LIMIT 1`
    )
  )[0];
  assert.ok(order, "dev needs a purchase order with a user and a total");
  assert.ok(Number(order.total_price) > 0, "the fixture order must be worth something");
});

after(async () => {
  restoreSessions();
  await pool.end();
});

test("the balance moves by exactly what the ledger records", async () => {
  await inPinnedTransaction(async (client) => {
    await as({ ...admin, role: "admin" }, async () => {
      const before = await client.query(
        `SELECT coalesce(dorado_funds, 0) AS funds FROM exchange.users WHERE id = $1`,
        [order.user_id]
      );

      const res = await request(app)
        .post("/api/purchase_orders/add_funds_to_account")
        .send({
          order: { id: order.id, user_id: order.user_id, total_price: order.total_price },
          // Sent deliberately. The frontend still posts it and the service must
          // no longer read it - this is the D1 shape: not accepted rather than
          // accepted and overwritten.
          spots: [{ type: "Gold", ask_spot: 1, bid_spot: 1 }],
        });

      assert.equal(res.status, 200, `answered ${res.status}: ${JSON.stringify(res.body)}`);

      const after = await client.query(
        `SELECT coalesce(dorado_funds, 0) AS funds FROM exchange.users WHERE id = $1`,
        [order.user_id]
      );
      const moved = Number(after.rows[0].funds) - Number(before.rows[0].funds);

      const logged = await client.query(
        `SELECT amount FROM exchange.account_transactions
          WHERE user_id = $1 AND purchase_order_id = $2 AND transaction_type = 'Credit'
          ORDER BY occurred_at DESC, id DESC LIMIT 1`,
        [order.user_id, order.id]
      );
      assert.ok(logged.rows[0], "no ledger entry was written for the credit");

      // The property: the record explains the movement. Compared to the cent,
      // because dorado_funds carries more precision than money does.
      assert.equal(
        Number(logged.rows[0].amount).toFixed(2),
        moved.toFixed(2),
        `credited ${moved.toFixed(2)} but the ledger says ${Number(logged.rows[0].amount).toFixed(2)}`
      );
    });
  });
});

// The forged spots must change nothing. Before the fix they decided the ledger
// amount outright.
//
// THIS COUNTS THE ROWS FIRST, and that is not belt-and-braces. The first version
// only read the newest Credit row for the order and compared it - and it PASSED
// against the broken code, because the broken code throws on an order with no
// order_items, writes nothing, and leaves the newest row being one dev already
// had. A test that reads a row it did not cause is not testing anything.
test("spots in the request body do not reach the ledger", async () => {
  await inPinnedTransaction(async (client) => {
    await as({ ...admin, role: "admin" }, async () => {
      const countOf = async () =>
        Number(
          (
            await client.query(
              `SELECT count(*)::int AS n FROM exchange.account_transactions
                WHERE user_id = $1 AND purchase_order_id = $2 AND transaction_type = 'Credit'`,
              [order.user_id, order.id]
            )
          ).rows[0].n
        );

      const before = await countOf();

      const res = await request(app)
        .post("/api/purchase_orders/add_funds_to_account")
        .send({
          order: { id: order.id, user_id: order.user_id, total_price: order.total_price },
          spots: [{ type: "Gold", ask_spot: 0, bid_spot: 0 }],
        });
      assert.equal(res.status, 200, `answered ${res.status}: ${JSON.stringify(res.body)}`);
      assert.equal(await countOf(), before + 1, "this request wrote no ledger entry");

      const logged = await client.query(
        `SELECT amount FROM exchange.account_transactions
          WHERE user_id = $1 AND purchase_order_id = $2 AND transaction_type = 'Credit'
          ORDER BY occurred_at DESC, id DESC LIMIT 1`,
        [order.user_id, order.id]
      );
      assert.equal(
        Number(logged.rows[0].amount).toFixed(2),
        Number(order.total_price).toFixed(2),
        "the ledger amount followed the request body's spots"
      );
    });
  });
});
