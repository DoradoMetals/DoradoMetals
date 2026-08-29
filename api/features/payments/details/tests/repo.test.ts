// The payout account write, against real Postgres, each test rolled back.
//
// What makes this worth testing rather than trusting: the legacy insertPayout
// wrote one flat row and this writes an account, a link and a fee to three
// different tables. The link in particular is the thing I got wrong once - I
// read 073's "order_id -> not carried" and stopped before the clause that says
// where the link actually lives.
import test, { after, before } from "node:test";
import assert from "node:assert/strict";
import type { PoolClient } from "pg";
import pool from "#db";
import * as details from "#features/payments/details/repo.ts";

let client: PoolClient;

before(async () => {
  assert.equal(
    new Date().getTimezoneOffset(), 0,
    "these tests require TZ=UTC - run them with `pnpm --filter @dorado/api test`"
  );
  client = await pool.connect();
});
after(async () => { client.release(); await pool.end(); });

const inRollback = async (fn: (c: PoolClient) => Promise<void>) => {
  await client.query("BEGIN");
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

test("linking points the order's intent at the account, and only that order's", async () => {
  await inRollback(async (c: PoolClient) => {
    const { rows: intents } = await c.query(
      "SELECT id, order_id FROM payments.intents WHERE order_id IS NOT NULL LIMIT 2"
    );
    assert.ok(intents.length, "no intent carries an order, so this test would assert nothing");
    const mine = intents[0];

    const id = await details.create({ user_id: await aUser(c), method: "ECHECK" }, c);
    const touched = await details.linkToOrder(mine.order_id, id, c);
    assert.ok(touched.length, "the link updated no intent");

    const { rows: [got] } = await c.query(
      "SELECT details_id FROM payments.intents WHERE id = $1", [mine.id]
    );
    assert.equal(got.details_id, id);

    if (intents[1] && intents[1].order_id !== mine.order_id) {
      const { rows: [other] } = await c.query(
        "SELECT details_id FROM payments.intents WHERE id = $1", [intents[1].id]
      );
      assert.notEqual(other.details_id, id, "linking one order changed another order's intent");
    }
  });
});

test("changing the method walks order -> intent -> details", async () => {
  await inRollback(async (c: PoolClient) => {
    const { rows: [intent] } = await c.query(
      "SELECT id, order_id FROM payments.intents WHERE order_id IS NOT NULL LIMIT 1"
    );
    assert.ok(intent, "no intent carries an order, so this test would assert nothing");

    const id = await details.create({ user_id: await aUser(c), method: "ECHECK" }, c);
    await details.linkToOrder(intent.order_id, id, c);

    const changed = await details.setMethodForOrder(intent.order_id, "WIRE", c);
    assert.deepEqual(changed, [id], "the method change did not land on the linked account");

    const { rows: [row] } = await c.query(
      `SELECT m.type FROM payments.details d JOIN payments.methods m ON m.id = d.method_id
        WHERE d.id = $1`, [id]
    );
    assert.equal(row.type, "WIRE");
  });
});
