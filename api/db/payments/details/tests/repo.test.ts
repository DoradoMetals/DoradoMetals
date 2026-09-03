// payments.details - the payout account write, against real Postgres, each
// test rolled back.
//
// THE METHOD NAME NO LONGER RESOLVES HERE. It used to be a SELECT driving the
// INSERT, so an unknown method wrote nothing; the service resolves it against
// payments.methods now and refuses before this is reached. What is left in
// this file is the account itself.
//
// THE LINK IS orders.transactions.payout_details_id, and the two tests that
// walk it stay: before 099 the link ran order -> payments.intents -> details,
// and an intent is money coming IN, so it resolved for zero of the sixteen
// payouts on dev while every test passed (D168). They pick a PURCHASE order
// deliberately - that is the only kind with a payout.
import { test, afterAll, beforeAll } from "vitest";
import assert from "node:assert/strict";
import type { PoolClient } from "pg";
import { randomUUID } from "node:crypto";
import pool from "#db";
import * as details from "#db/payments/details/repo.ts";
import * as methods from "#db/payments/methods/repo.ts";
import * as transactions from "#db/orders/transactions/repo.ts";
import { LOCKS, takeLocks } from "#shared/testing/locks.ts";

let client: PoolClient;

beforeAll(async () => {
  assert.equal(
    new Date().getTimezoneOffset(), 0,
    "these tests require TZ=UTC - run them with `pnpm --filter @dorado/api test`"
  );
  client = await pool.connect();
});
afterAll(async () => { client.release(); await pool.end(); });

// LOCKS.ORDERS because this file writes orders.transactions.
const inRollback = async (fn: (c: PoolClient) => Promise<void>) => {
  await client.query("BEGIN");
  await takeLocks(client, [LOCKS.ORDERS]);
  try { await fn(client); } finally { await client.query("ROLLBACK"); }
};

const aUser = async (c: PoolClient) => {
  const { rows } = await c.query("SELECT id FROM exchange.users LIMIT 1");
  assert.ok(rows.length, "the test database has no users, so this would assert nothing");
  return rows[0].id;
};

const methodId = async (c: PoolClient, type: string) => {
  const row = await methods.findByType("purchase", type, c);
  assert.ok(row, `the payment methods seed has no purchase ${type}`);
  return row!.id;
};

const anAccount = async (c: PoolClient, type = "ECHECK") =>
  await details.create(
    randomUUID(),
    await aUser(c),
    { method_id: await methodId(c, type), account_holder: "A Customer", email_to: "a@b.co" },
    c
  );

test("an account is created with the method the caller resolved", async () => {
  await inRollback(async (c: PoolClient) => {
    const row = await anAccount(c);
    assert.equal(row.account_holder, "A Customer");
    assert.equal(row.email_to, "a@b.co");
    assert.equal(row.method_id, await methodId(c, "ECHECK"));

    const read = await details.getOne(row.id, c);
    assert.equal(read?.id, row.id);
    assert.ok((await details.listFor(row.user_id, c)).some((r) => r.id === row.id));
  });
});

// The standing constraint, asserted rather than assumed. These are the only
// plaintext bank details the business holds and they must stay in exactly one
// place while encryption at rest is outstanding.
test("the account write never stores routing or account numbers", async () => {
  await inRollback(async (c: PoolClient) => {
    const row = await details.create(
      randomUUID(),
      await aUser(c),
      {
        method_id: await methodId(c, "ACH"),
        account_holder: "A Customer",
        last_four: "6789",
        routing_last_four: "4321",
      },
      c
    );
    const { rows: [stored] } = await c.query(
      "SELECT routing_number, account_number, last_four FROM payments.details WHERE id = $1",
      [row.id]
    );
    assert.equal(stored.routing_number, null, "a routing number reached payments.details");
    assert.equal(stored.account_number, null, "an account number reached payments.details");
    assert.equal(stored.last_four, "6789", "last_four is safe and should be kept");
  });
});

test("update answers true for a real id and false for one with no account", async () => {
  await inRollback(async (c: PoolClient) => {
    const row = await anAccount(c);
    const wire = await methodId(c, "WIRE");

    assert.equal(await details.update(row.id, { method_id: wire }, c), true);
    const after = await details.getOne(row.id, c);
    assert.equal(after?.method_id, wire);
    assert.equal(after?.account_holder, "A Customer", "an unnamed column was overwritten");

    assert.equal(await details.update(randomUUID(), { method_id: wire }, c), false);
  });
});

test("an explicit null CLEARS a column, and an absent key leaves it", async () => {
  await inRollback(async (c: PoolClient) => {
    const row = await anAccount(c);
    await details.update(row.id, { email_to: null }, c);
    const after = await details.getOne(row.id, c);
    assert.equal(after?.email_to, null, "an explicit null did not clear the column");
    assert.equal(after?.account_holder, "A Customer", "an absent key cleared a column");
  });
});

test("remove answers true once and false the second time", async () => {
  await inRollback(async (c: PoolClient) => {
    const row = await anAccount(c);
    assert.equal(await details.remove(row.id, c), true);
    assert.equal(await details.remove(row.id, c), false);
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
  assert.ok(rows.length, "no purchase order has a transactions row - this would assert nothing");
  return rows;
};

test("linking points the ORDER at the account, and only that order", async () => {
  await inRollback(async (c: PoolClient) => {
    const orders = await aPurchaseOrderWithTotals(c);
    const mine = orders[0].order_id;

    const row = await anAccount(c);
    const touched = await transactions.update(mine, { payout_details_id: row.id }, {}, c);
    assert.ok(touched, "the link matched no orders.transactions row");
    const { rows: [linked] } = await c.query(
      "SELECT payout_details_id FROM orders.transactions WHERE order_id = $1", [mine]
    );
    assert.equal(linked.payout_details_id, row.id);

    if (orders[1]) {
      const { rows: [other] } = await c.query(
        "SELECT payout_details_id FROM orders.transactions WHERE order_id = $1",
        [orders[1].order_id]
      );
      assert.notEqual(
        other.payout_details_id, row.id, "linking one order changed another order's account"
      );
    }
  });
});

// An UPDATE that matches nothing does not raise, so the link reports rather
// than pretending.
test("linking an order with no transactions row reports it rather than passing", async () => {
  await inRollback(async (c: PoolClient) => {
    const row = await anAccount(c);
    const touched = await transactions.update(
      "00000000-0000-0000-0000-000000000000", { payout_details_id: row.id }, {}, c
    );
    assert.equal(touched, false, "a link that reached nobody was reported as done");
  });
});
