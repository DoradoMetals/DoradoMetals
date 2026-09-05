import { test, afterAll, beforeAll } from "vitest";
import assert from "node:assert/strict";
import type { PoolClient } from "pg";
import { randomUUID } from "node:crypto";
import pool from "#pool";
import * as creditService from "#payments/credit/service.ts";
import * as transactions from "#payments/transactions/service.ts";
import { takeLocks, LOCKS } from "#shared/testing/locks.ts";
import { rollbackIn } from "#shared/testing/rollback.ts";
import { TEST_ACTOR } from "#shared/testing/actor.ts";
import { aUser as buildUser, anOrder } from "#shared/testing/builders/index.ts";

let client: PoolClient;

beforeAll(async () => {
  assert.equal(
    new Date().getTimezoneOffset(), 0,
    "these tests require TZ=UTC - run them with `pnpm --filter @dorado/api test`"
  );
  client = await pool.connect();
});

afterAll(async () => {
  client.release();
  await pool.end();
});

const inRollback = rollbackIn({ lock: LOCKS.USERS });

const aUser = async (c: PoolClient) => buildUser(c, { funds: 0 });

const balance = async (c: PoolClient, id: string) =>
  Number((await c.query("SELECT dorado_funds FROM auth.users WHERE id = $1", [id])).rows[0].dorado_funds ?? 0);

test("adding funds increases the balance by exactly the amount", async () => {
  await inRollback(async (c: PoolClient) => {
    const user = await aUser(c);
    assert.equal(await balance(c, user.id), 0, "a built customer does not start at zero");
    await creditService.addFunds(user.id, 250.75, c);
    assert.equal(await balance(c, user.id), 250.75);
  });
});

test("removing funds decreases it by exactly the amount", async () => {
  await inRollback(async (c: PoolClient) => {
    const user = await aUser(c);
    await creditService.addFunds(user.id, 500, c);
    await creditService.removeFunds(user.id, 100.25, c);
    assert.equal(await balance(c, user.id), 399.75);
  });
});

test("a balance is a number, not a string", async () => {
  await inRollback(async (c: PoolClient) => {
    const user = await aUser(c);
    await creditService.addFunds(user.id, 10, c);
    const { rows } = await c.query("SELECT dorado_funds FROM auth.users WHERE id = $1", [user.id]);
    assert.equal(typeof rows[0].dorado_funds, "number");
  });
});

test("adding then removing the same amount is a round trip", async () => {
  await inRollback(async (c: PoolClient) => {
    const user = await aUser(c);
    const before = await balance(c, user.id);
    await creditService.addFunds(user.id, 33.33, c);
    await creditService.removeFunds(user.id, 33.33, c);
    assert.equal(await balance(c, user.id), before);
  });
});

test("removing more than the balance goes negative rather than refusing", async () => {
  await inRollback(async (c: PoolClient) => {
    const user = await aUser(c);
    const before = await balance(c, user.id);
    await creditService.removeFunds(user.id, before + 1000, c);
    assert.ok(await balance(c, user.id) < 0);
  });
});

test("a transaction log records the movement", async () => {
  await inRollback(async (c: PoolClient) => {
    const user = await aUser(c);
    const order = await anOrder(c, user, { direction: "purchase" });
    await transactions.addTransactionLog(
      { user_id: user.id, type: "credit", order_id: order.id, amount: 42.5 }, c
    );

    const { rows } = await c.query(
      `SELECT amount, type FROM payments.ledger
       WHERE user_id = $1 AND order_id = $2 ORDER BY created_at DESC LIMIT 1`,
      [user.id, order.id]
    );
    assert.equal(Number(rows[0].amount), 42.5);
    assert.equal(rows[0].type, "credit");
  });
});

test("a rolled-back movement leaves neither the balance nor the log changed", async () => {
  const other = await pool.connect();
  try {
    const user = TEST_ACTOR;
    const before = await balance(other, user.id);
    const { rows: [{ n: logsBefore }] } = await other.query(
      "SELECT count(*)::int n FROM payments.ledger WHERE user_id = $1", [user.id]
    );

    await client.query("BEGIN");
    await creditService.addFunds(user.id, 999.99, client);
    await transactions.addTransactionLog(
      { user_id: user.id, type: `sentinel-${randomUUID().slice(0, 8)}`, order_id: null, amount: 999.99 },
      client
    );

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
