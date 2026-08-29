// Crediting a customer's account from a purchase order, over real HTTP.
//
// WHY THIS FILE EXISTS. add_funds_to_account was one of the 46 mounted routes
// never driven by any test, and reading it showed the balance and the ledger
// entry explaining it were computed two different ways:
//
//   addFunds(user, order.total_price)                    <- the movement
//   addTransactionLog(..., calculateTotalPrice(order, spots))  <- the record
//
// with `spots` arriving in the request body. In production all NINE Credit
// entries differ from the total_price of the order they name, three materially.
//
// The operation is `add_funds: true` on the unified PATCH /api/orders/:id
// now, and the document carries NOTHING else the credit could read: the
// service re-fetches the order and credits totals.total, the order's own
// stored figure. The old poison vector - spots in the body deciding the
// ledger amount - is structurally gone; spots have their OWN endpoint, and
// the second test drives a spot write right before the credit to prove even
// that changes nothing.
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
import { LOCKS } from "#shared/testing/locks.ts";

// This file did not need a lock while it only wrote funds and the ledger; the
// second test now also writes an order's frozen spot through the PATCH
// document, and orders tables are what ORDERS serialises.
const ORDER_LOCK = LOCKS.ORDERS;

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
        .patch(`/api/orders/${order.id}`)
        .send({ add_funds: true });

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
  }, { lock: ORDER_LOCK });
});

// The nearest thing an admin can still do with spots must change nothing:
// rewrite the order's frozen Gold spot to zero through the spots endpoint,
// then credit the funds - and the ledger must follow the order's stored
// total, untouched by the spot write that ran first.
//
// THIS COUNTS THE ROWS FIRST, and that is not belt-and-braces. The first version
// only read the newest Credit row for the order and compared it - and it PASSED
// against the broken code, because the broken code throws on an order with no
// order_items, writes nothing, and leaves the newest row being one dev already
// had. A test that reads a row it did not cause is not testing anything.
test("a spot write just before the credit does not reach the ledger", async () => {
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

      const zeroed = await request(app)
        .put(`/api/orders/${order.id}/spots`)
        .send({ set: [{ name: "Gold", bid: 0 }] });
      assert.equal(zeroed.status, 200, `the spot write answered ${zeroed.status}`);

      const res = await request(app)
        .patch(`/api/orders/${order.id}`)
        .send({ add_funds: true });
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
        "the ledger amount followed the spot write in the same document"
      );
    });
  }, { lock: ORDER_LOCK });
});
