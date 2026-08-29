// The payout account write, against real Postgres, each test rolled back.
//
// What makes this worth testing rather than trusting: the legacy insertPayout
// wrote one flat row and this writes an account, a link and a fee to three
// different tables.
//
// *** THE LINK TESTS BELOW USED TO PROVE THE OPPOSITE OF WHAT THEY CLAIMED. ***
// They picked their subject with
// `SELECT id, order_id FROM payments.intents WHERE order_id IS NOT NULL LIMIT 1`
// - and every intent that carries an order carries a SALES order, because an
// intent is money coming in. So they exercised the link on the one class of
// order that never has a payout, and passed, while the link resolved for zero
// of the sixteen payouts on dev. D168; 099 moved the link to
// orders.transactions.payout_details_id.
//
// They now pick a PURCHASE order, which is the only kind with a payout. That
// choice is the assertion: if the link is ever routed back through an intent,
// these fail rather than pass on a sales order.
import test, { after, before } from "node:test";
import assert from "node:assert/strict";
import type { PoolClient } from "pg";
import pool from "#db";
import * as details from "#features/payments/details/repo.ts";
import * as transactions from "#features/orders/transactions/repo.ts";
import { LOCKS, takeLocks } from "#shared/testing/locks.ts";

let client: PoolClient;

before(async () => {
  assert.equal(
    new Date().getTimezoneOffset(), 0,
    "these tests require TZ=UTC - run them with `pnpm --filter @dorado/api test`"
  );
  client = await pool.connect();
});
after(async () => { client.release(); await pool.end(); });

// LOCKS.ORDERS BECAUSE THIS FILE NOW WRITES orders.transactions. It did not
// before: the link used to be payments.intents.details_id, which no other test
// file touches. Moving the link to the orders side (099) moved this file into
// the ORDERS group, and a test that changes which tables it writes has to
// re-ask which lock it needs - see shared/testing/locks.ts.
const inRollback = async (fn: (c: PoolClient) => Promise<void>) => {
  await client.query("BEGIN");
  await takeLocks(client, [LOCKS.ORDERS]);
  try { await fn(client); } finally { await client.query("ROLLBACK"); }
};

const aUser = async (c: PoolClient) => {
  const { rows } = await c.query("SELECT id FROM exchange.users LIMIT 1");
  assert.ok(rows.length, "dev has no users, so this test would assert nothing");
  return rows[0].id;
};

test("an account is created and resolves its method by name", async () => {
  await inRollback(async (c: PoolClient) => {
    const id = await details.create(
      { user_id: await aUser(c), method: "ECHECK", account_holder: "A Customer", email_to: "a@b.co" },
      c
    );
    assert.ok(id, "no account row was created");

    const { rows: [row] } = await c.query(
      `SELECT d.account_holder, d.email_to, m.type, m.direction
         FROM payments.details d JOIN payments.methods m ON m.id = d.method_id
        WHERE d.id = $1`, [id]
    );
    assert.equal(row.account_holder, "A Customer");
    assert.equal(row.email_to, "a@b.co");
    assert.equal(row.type, "ECHECK");
    assert.equal(row.direction, "purchase", "a payout resolved against a sale method");
  });
});

// The one rename 073 established. If this stops mapping, payouts silently stop
// resolving a method and the INSERT writes nothing at all.
test("DORADO_ACCOUNT maps to the method called DORADO CREDIT", async () => {
  await inRollback(async (c: PoolClient) => {
    const id = await details.create({ user_id: await aUser(c), method: "DORADO_ACCOUNT" }, c);
    assert.ok(id, "DORADO_ACCOUNT did not resolve to a method");
    const { rows: [row] } = await c.query(
      `SELECT m.type FROM payments.details d JOIN payments.methods m ON m.id = d.method_id
        WHERE d.id = $1`, [id]
    );
    assert.equal(row.type, "DORADO CREDIT");
  });
});

test("an unknown method writes no row at all rather than one with no method", async () => {
  await inRollback(async (c: PoolClient) => {
    const before = (await c.query("SELECT count(*)::int n FROM payments.details")).rows[0].n;
    const id = await details.create({ user_id: await aUser(c), method: "NOT A METHOD" }, c);
    const after = (await c.query("SELECT count(*)::int n FROM payments.details")).rows[0].n;
    assert.equal(id, null, "an unknown method returned an id");
    assert.equal(after, before, "a row was written for an unresolvable method");
  });
});

// The standing constraint, asserted rather than assumed. These are the only
// plaintext bank details the business holds and they must stay in exactly one
// place while encryption at rest is outstanding.
test("the account write never stores routing or account numbers", async () => {
  await inRollback(async (c: PoolClient) => {
    const id = await details.create(
      {
        user_id: await aUser(c),
        method: "ECHECK",
        account_holder: "A Customer",
        last_four: "6789",
      },
      c
    );
    const { rows: [row] } = await c.query(
      "SELECT routing_number, account_number, last_four FROM payments.details WHERE id = $1", [id]
    );
    assert.equal(row.routing_number, null, "a routing number reached payments.details");
    assert.equal(row.account_number, null, "an account number reached payments.details");
    assert.equal(row.last_four, "6789", "last_four is safe and should be kept");
  });
});

// A PURCHASE order, and the test says out loud why. `LIMIT 1` on a table
// holding both directions is how the previous version of this file came to
// assert nothing.
const aPurchaseOrderWithTotals = async (c: PoolClient) => {
  const { rows } = await c.query(
    `SELECT t.order_id
       FROM orders.transactions t JOIN orders.orders o ON o.id = t.order_id
      WHERE o.direction = 'purchase'
      ORDER BY t.order_id LIMIT 2`
  );
  assert.ok(rows.length, "no purchase order has a transactions row - this test would assert nothing");
  return rows;
};

test("linking points the ORDER at the account, and only that order", async () => {
  await inRollback(async (c: PoolClient) => {
    const orders = await aPurchaseOrderWithTotals(c);
    const mine = orders[0].order_id;

    const id = await details.create({ user_id: await aUser(c), method: "ECHECK" }, c);
    const touched = await transactions.setPayoutAccount(mine, id, null, c);
    assert.ok(touched, "the link matched no orders.transactions row");
    assert.equal(touched.payout_details_id, id);

    const { rows: [got] } = await c.query(
      "SELECT payout_details_id FROM orders.transactions WHERE order_id = $1", [mine]
    );
    assert.equal(got.payout_details_id, id);

    if (orders[1]) {
      const { rows: [other] } = await c.query(
        "SELECT payout_details_id FROM orders.transactions WHERE order_id = $1", [orders[1].order_id]
      );
      assert.notEqual(other.payout_details_id, id, "linking one order changed another order's account");
    }
  });
});

// The failure this whole seam is about: an UPDATE that matches nothing does not
// raise. setPayoutAccount returns the row so a caller can tell the two apart,
// and this pins that it really does return undefined rather than pretending.
test("linking an order with no transactions row reports it rather than passing", async () => {
  await inRollback(async (c: PoolClient) => {
    const id = await details.create({ user_id: await aUser(c), method: "ECHECK" }, c);
    const touched = await transactions.setPayoutAccount(
      "00000000-0000-0000-0000-000000000000", id, null, c
    );
    assert.equal(touched, undefined, "a link that reached nobody was reported as done");
  });
});

test("changing the method walks order -> transactions -> details", async () => {
  await inRollback(async (c: PoolClient) => {
    const order_id = (await aPurchaseOrderWithTotals(c))[0].order_id;

    const id = await details.create({ user_id: await aUser(c), method: "ECHECK" }, c);
    await transactions.setPayoutAccount(order_id, id, null, c);

    const changed = await details.setMethodForOrder(order_id, "WIRE", c);
    assert.deepEqual(changed, [id], "the method change did not land on the linked account");

    const { rows: [row] } = await c.query(
      `SELECT m.type FROM payments.details d JOIN payments.methods m ON m.id = d.method_id
        WHERE d.id = $1`, [id]
    );
    assert.equal(row.type, "WIRE");
  });
});

// The other half of the same failure: before 099 this walked payments.intents,
// so for a purchase order it updated nothing and said nothing. If the join ever
// goes back, this returns [] and fails.
test("changing the method on a purchase order actually reaches an account", async () => {
  await inRollback(async (c: PoolClient) => {
    const order_id = (await aPurchaseOrderWithTotals(c))[0].order_id;
    const id = await details.create({ user_id: await aUser(c), method: "ECHECK" }, c);
    await transactions.setPayoutAccount(order_id, id, null, c);

    const intents = await c.query(
      "SELECT count(*)::int n FROM payments.intents WHERE order_id = $1", [order_id]
    );
    assert.equal(intents.rows[0].n, 0, "this purchase order has an intent, so the old join would have worked too");

    const changed = await details.setMethodForOrder(order_id, "ACH", c);
    assert.equal(changed.length, 1, "the method change reached no account");
  });
});
