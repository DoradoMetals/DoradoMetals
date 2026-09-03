// The customer balance path, against real Postgres. addFunds/removeFunds move the balance, addTransactionLog records why - a write escaping its transaction would take money with it, so the tests are mostly about the two staying together.
// Each runs inside a transaction that is rolled back, so no real balance moves.
import test, { after, before } from "node:test";
import assert from "node:assert/strict";
import type { PoolClient } from "pg";
import { randomUUID } from "node:crypto";
import pool from "#db";
// addFunds/removeFunds write exchange.users.dorado_funds, and users owns that table - two services writing one table is the thing the structure forbids.
import * as usersService from "#domain/users/service.ts";
// The ledger entry that records WHY a balance moved lives in its own feature: the balance is users', the log is transactions'.
import * as transactions from "#domain/transactions/service.ts";
import { takeLocks, LOCKS } from "#shared/testing/locks.ts";

let client: PoolClient;

before(async () => {
  assert.equal(
    new Date().getTimezoneOffset(), 0,
    "these tests require TZ=UTC - run them with `pnpm --filter @dorado/api test`"
  );
  client = await pool.connect();
});

after(async () => {
  client.release();
  await pool.end();
});

async function inRollback(fn: (c: PoolClient) => Promise<void>) {
  await client.query("BEGIN");
  // Two row locks per balance write - see LOCKS.USERS.
  await takeLocks(client, LOCKS.USERS);
  try {
    await fn(client);
  } finally {
    await client.query("ROLLBACK");
  }
}

const aUser = async (c: PoolClient) =>
  (await c.query("SELECT id, dorado_funds FROM exchange.users ORDER BY id LIMIT 1")).rows[0];

const balance = async (c: PoolClient, id: string) =>
  Number((await c.query("SELECT dorado_funds FROM exchange.users WHERE id = $1", [id])).rows[0].dorado_funds ?? 0);

test("adding funds increases the balance by exactly the amount", async () => {
  await inRollback(async (c: PoolClient) => {
    const user = await aUser(c);
    const before = await balance(c, user.id);
    await usersService.addFunds(user.id, 250.75, c);
    assert.equal(await balance(c, user.id), before + 250.75);
  });
});

test("removing funds decreases it by exactly the amount", async () => {
  await inRollback(async (c: PoolClient) => {
    const user = await aUser(c);
    const before = await balance(c, user.id);
    await usersService.removeFunds(user.id, 100.25, c);
    assert.equal(await balance(c, user.id), before - 100.25);
  });
});

// Money is NUMERIC - without the type parsers registered in db.js it arrives as a string and `balance + amount` concatenates rather than adds.
test("a balance is a number, not a string", async () => {
  await inRollback(async (c: PoolClient) => {
    const user = await aUser(c);
    await usersService.addFunds(user.id, 10, c);
    const { rows } = await c.query("SELECT dorado_funds FROM exchange.users WHERE id = $1", [user.id]);
    assert.equal(typeof rows[0].dorado_funds, "number");
  });
});

// Adding and removing the same amount must leave the balance where it started - floating point makes that worth asserting.
test("adding then removing the same amount is a round trip", async () => {
  await inRollback(async (c: PoolClient) => {
    const user = await aUser(c);
    const before = await balance(c, user.id);
    await usersService.addFunds(user.id, 33.33, c);
    await usersService.removeFunds(user.id, 33.33, c);
    assert.equal(await balance(c, user.id), before);
  });
});

// removeFunds does not check the balance first - nothing stops it going negative if two checkouts race. Pinned as behaviour, not fixed.
test("removing more than the balance goes negative rather than refusing", async () => {
  await inRollback(async (c: PoolClient) => {
    const user = await aUser(c);
    const before = await balance(c, user.id);
    await usersService.removeFunds(user.id, before + 1000, c);
    assert.ok(await balance(c, user.id) < 0);
  });
});

test("a transaction log records the movement", async () => {
  await inRollback(async (c: PoolClient) => {
    const user = await aUser(c);
    const { rows: [order] } = await c.query(
      "SELECT id FROM orders.orders WHERE direction = 'purchase' LIMIT 1");
    await transactions.addTransactionLog(user.id, "credit", order.id, null, 42.5, c);

    const { rows } = await c.query(
      `SELECT amount, type FROM payments.ledger
       WHERE user_id = $1 AND order_id = $2 ORDER BY created_at DESC LIMIT 1`,
      [user.id, order.id]
    );
    assert.equal(Number(rows[0].amount), 42.5);
    assert.equal(rows[0].type, "credit");
  });
});

// The property that matters most: the balance change and its log entry are one transaction.
test("a rolled-back movement leaves neither the balance nor the log changed", async () => {
  const other = await pool.connect();
  try {
    const user = await aUser(other);
    const before = await balance(other, user.id);
    const { rows: [{ n: logsBefore }] } = await other.query(
      "SELECT count(*)::int n FROM payments.ledger WHERE user_id = $1", [user.id]
    );

    await client.query("BEGIN");
    await usersService.addFunds(user.id, 999.99, client);
    await transactions.addTransactionLog(user.id, `sentinel-${randomUUID().slice(0, 8)}`, null, null, 999.99, client);

    // Visible inside, invisible outside.
    assert.equal(await balance(client, user.id), before + 999.99);
    assert.equal(await balance(other, user.id), before, "the balance change escaped the transaction");

    await client.query("ROLLBACK");

    assert.equal(await balance(other, user.id), before);
    const { rows: [{ n: logsAfter }] } = await other.query(
      "SELECT count(*)::int n FROM payments.ledger WHERE user_id = $1", [user.id]
    );
    assert.equal(logsAfter, logsBefore, "a log entry survived a rolled-back movement");
  } finally {
    other.release();
  }
});
