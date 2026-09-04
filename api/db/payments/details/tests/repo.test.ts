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
import pool from "#pool";
import * as details from "#db/payments/details/repo.ts";
import * as methods from "#db/payments/methods/repo.ts";
import * as transactions from "#db/orders/transactions/repo.ts";
import { LOCKS } from "#shared/testing/locks.ts";
import { rollbackIn } from "#shared/testing/rollback.ts";
import { aUser, anOrder } from "#shared/testing/builders/index.ts";


beforeAll(async () => {
  assert.equal(
    new Date().getTimezoneOffset(), 0,
    "these tests require TZ=UTC - run them with `pnpm --filter @dorado/api test`"
  );
});
afterAll(async () => { await pool.end(); });

// LOCKS.ORDERS because this file writes orders.transactions.
const inRollback = rollbackIn({ lock: LOCKS.ORDERS });

const methodId = async (c: PoolClient, type: string) => {
  const row = await methods.findByType("purchase", type, c);
  assert.ok(row, `the payment methods seed has no purchase ${type}`);
  return row!.id;
};

const anAccount = async (c: PoolClient, type = "ECHECK") =>
  await details.create(
    randomUUID(),
    (await aUser(c)).id,
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
      (await aUser(c)).id,
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

// TWO PURCHASE ORDERS, EACH WITH ITS OWN MONEY ROW, BUILT. The direction was
// already spelled out here because `LIMIT 1` on a table holding both is how an
// earlier version of this file came to assert nothing (D168) - and building
// them removes the other half of that problem: the pair is now guaranteed to
// exist and guaranteed to be two DIFFERENT orders, which is what "only that
// order" needs to mean anything.
const twoPurchaseOrdersWithTotals = async (c: PoolClient) => {
  const user = await aUser(c);
  const first = await anOrder(c, user, { direction: "purchase" }).withTotals({ total: 100 });
  const second = await anOrder(c, user, { direction: "purchase" }).withTotals({ total: 200 });
  return [first, second];
};

test("linking points the ORDER at the account, and only that order", async () => {
  await inRollback(async (c: PoolClient) => {
    const orders = await twoPurchaseOrdersWithTotals(c);
    const mine = orders[0].id;

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
        [orders[1].id]
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
