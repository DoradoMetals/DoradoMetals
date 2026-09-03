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
// The operation is POST /api/orders/:id/add_funds now (D214 item 11) - a real
// action rather than a flag in a PATCH body - and it carries NO body at all:
// the
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
import type { PoolClient } from "pg";
import request from "supertest";
import pool from "#db";
import { mockSessions, restoreSessions, as, asAdmin } from "#shared/testing/session.ts";
import { inPinnedTransaction, outside } from "#shared/testing/pinned-pool.ts";
import { LOCKS } from "#shared/testing/locks.ts";

// BOTH LOCKS, NOT JUST ORDERS. This file's earlier comment said funds and the
// ledger "did not need a lock" - wrong, and found by lane 0's sweep
// (docs/waves/test-suite-redesign.md): add_funds moves exchange.users -
// dorado_funds, and that write is two row locks (exchange.users and, through
// 107's mirror trigger, auth.users - see LOCKS.USERS) racing against every
// other file that moves a balance, `db/users/tests/repo.test.ts` included.
// The second test also writes an order's frozen spot through the PATCH
// document, which is what ORDERS serialises - so this file needs both.
const FUNDS_LOCKS = [LOCKS.USERS, LOCKS.ORDERS];

await mockSessions();
const { default: app } = await import("#app");

// THE STRUCTURAL SUBSET EACH FIXTURE ACTUALLY HAS. These are SELECT
// projections, not table rows - naming a row type would claim columns the
// query never asked for.
type UserFixture = { id: string; name: string | null; email: string | null };
type OrderFixture = { id: string; user_id: string; total_price: string | null };

let admin: UserFixture;
let order: OrderFixture;

before(async () => {
  admin = (
    await outside<UserFixture>(`SELECT id, name, email FROM exchange.users WHERE role = 'admin' LIMIT 1`)
  )[0];
  assert.ok(admin, "dev has no admin user");

  order = (
    await outside<OrderFixture>(
      `SELECT o.id, o.user_id, t.total AS total_price
         FROM orders.orders o
         JOIN orders.transactions t ON t.order_id = o.id
        WHERE o.direction = 'purchase' AND o.user_id IS NOT NULL AND t.total IS NOT NULL
        ORDER BY o.id LIMIT 1`
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
  await inPinnedTransaction(async (client: PoolClient) => {
    await asAdmin(admin, async () => {
      // auth.users, WHERE THE BALANCE LIVES SINCE MIGRATION 118. Reading the
      // frozen exchange copy measured a number that no longer moves, so this
      // assertion would have compared a real ledger entry against zero.
      const before = await client.query(
        `SELECT coalesce(dorado_funds, 0) AS funds FROM auth.users WHERE id = $1`,
        [order.user_id]
      );

      const res = await request(app)
        .post(`/api/orders/${order.id}/add_funds`)
        .send({});

      assert.equal(res.status, 200, `answered ${res.status}: ${JSON.stringify(res.body)}`);

      const after = await client.query(
        `SELECT coalesce(dorado_funds, 0) AS funds FROM auth.users WHERE id = $1`,
        [order.user_id]
      );
      const moved = Number(after.rows[0].funds) - Number(before.rows[0].funds);

      const logged = await client.query(
        `SELECT amount FROM payments.ledger
          WHERE user_id = $1 AND order_id = $2 AND type = 'Credit'
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
  }, { lock: FUNDS_LOCKS });
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
  await inPinnedTransaction(async (client: PoolClient) => {
    await asAdmin(admin, async () => {
      const countOf = async () =>
        Number(
          (
            await client.query(
              `SELECT count(*)::int AS n FROM payments.ledger
                WHERE user_id = $1 AND order_id = $2 AND type = 'Credit'`,
              [order.user_id, order.id]
            )
          ).rows[0].n
        );

      const before = await countOf();

      // THE METAL IS AN ID (D214 item 11): `set` used to name it by its
      // display string, which is what decided which money row an edit landed on.
      const { rows: [gold] } = await client.query(
        `SELECT id FROM metals.metals WHERE name = 'Gold'`
      );
      const zeroed = await request(app)
        .put(`/api/orders/${order.id}/spots`)
        .send({ set: [{ metal_id: gold.id, bid: 0 }] });
      assert.equal(zeroed.status, 200, `the spot write answered ${zeroed.status}`);

      const res = await request(app)
        .post(`/api/orders/${order.id}/add_funds`)
        .send({});
      assert.equal(res.status, 200, `answered ${res.status}: ${JSON.stringify(res.body)}`);
      assert.equal(await countOf(), before + 1, "this request wrote no ledger entry");

      const logged = await client.query(
        `SELECT amount FROM payments.ledger
          WHERE user_id = $1 AND order_id = $2 AND type = 'Credit'
          ORDER BY occurred_at DESC, id DESC LIMIT 1`,
        [order.user_id, order.id]
      );
      assert.equal(
        Number(logged.rows[0].amount).toFixed(2),
        Number(order.total_price).toFixed(2),
        "the ledger amount followed the spot write that ran before it"
      );
    });
  }, { lock: FUNDS_LOCKS });
});
