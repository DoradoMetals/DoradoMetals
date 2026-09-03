// The admin balance edit, against real Postgres.
//
// adjustUserCredit is the other half of the money path: transactions.addFunds
// and removeFunds move a balance during checkout, this is an admin setting one
// by hand. It has three modes and no guard rails, which is worth stating.
//
// IT NO LONGER PINS A MIRROR. The write and the read-back are the same row:
// there is no trigger between them to be dropped, and no second copy that can
// disagree.
import { test, afterAll, beforeAll } from "vitest";
import assert from "node:assert/strict";
import type { PoolClient } from "pg";
import pool from "#db";
import * as repo from "#db/users/repo.ts";
import { takeLocks, LOCKS } from "#shared/testing/locks.ts";

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

async function inRollback(fn: (c: PoolClient) => Promise<void>) {
  await client.query("BEGIN");
  // Files that move balances agree an order rather than deadlocking on
  // whichever customer each visited first. See LOCKS.USERS.
  await takeLocks(client, LOCKS.USERS);
  try {
    await fn(client);
  } finally {
    await client.query("ROLLBACK");
  }
}

// One user of auth.users. This used to join exchange.users to auth.users to
// avoid picking a row present in only one - 118 collapses the two tables into
// one, so the join has nothing left to establish.
const aUser = async (c: PoolClient) =>
  (await c.query(`SELECT id FROM auth.users ORDER BY id LIMIT 1`)).rows[0].id;

const balance = async (c: PoolClient, id: string) =>
  Number((await c.query("SELECT dorado_funds FROM auth.users WHERE id = $1", [id])).rows[0].dorado_funds ?? 0);

test("add increases the balance", async () => {
  await inRollback(async (c: PoolClient) => {
    const user = await aUser(c);
    const before = await balance(c, user);
    await repo.adjustCredit(user, "add", 150, c);
    assert.equal(await balance(c, user), before + 150);
  });
});

test("subtract decreases it", async () => {
  await inRollback(async (c: PoolClient) => {
    const user = await aUser(c);
    const before = await balance(c, user);
    await repo.adjustCredit(user, "subtract", 50, c);
    assert.equal(await balance(c, user), before - 50);
  });
});

// `edit` sets rather than adjusts - the mode most likely picked by mistake, replacing a balance instead of adding to it.
test("edit replaces the balance rather than adjusting it", async () => {
  await inRollback(async (c: PoolClient) => {
    const user = await aUser(c);
    await repo.adjustCredit(user, "add", 500, c);
    await repo.adjustCredit(user, "edit", 25, c);
    assert.equal(await balance(c, user), 25);
  });
});

// dorado_funds is NOT NULL DEFAULT 0 on auth.users, so a user always has a
// balance to adjust and the COALESCE in the query is belt and braces rather
// than load-bearing.
test("every user has a balance to adjust, never null", async () => {
  await inRollback(async (c: PoolClient) => {
    const { rows } = await c.query(
      "SELECT count(*) FILTER (WHERE dorado_funds IS NULL)::int nulls FROM auth.users"
    );
    assert.equal(rows[0].nulls, 0);
  });
});

// The CASE has no ELSE, so an unrecognised mode evaluates to NULL - the NOT NULL constraint is what turns a typo in the mode into an error rather than a wiped balance.
test("an unrecognised mode is refused rather than blanking the balance", async () => {
  await inRollback(async (c: PoolClient) => {
    const user = await aUser(c);
    await repo.adjustCredit(user, "add", 200, c);
    const before = await balance(c, user);

    await assert.rejects(
      // Deliberately outside CreditMode - the mode arrives from a request body cast by service.ts, so an unrecognised one really can reach here.
      // @ts-expect-error - an unrecognised mode is the point of this test
      () => repo.adjustCredit(user, "increment", 10, c),
      /not-null|null value/i,
      "an unrecognised mode was accepted"
    );

    await c.query("ROLLBACK");
    await c.query("BEGIN");
    assert.notEqual(await balance(c, user), null);
  });
});

test("subtracting more than the balance goes negative", async () => {
  await inRollback(async (c: PoolClient) => {
    const user = await aUser(c);
    await repo.adjustCredit(user, "edit", 10, c);
    await repo.adjustCredit(user, "subtract", 100, c);
    assert.equal(await balance(c, user), -90);
  });
});

test("an adjustment on a client is invisible on another connection", async () => {
  const other = await pool.connect();
  await client.query("BEGIN");
  await takeLocks(client, LOCKS.USERS);
  try {
    const user = await aUser(client);
    const sentinel = 123456.78;
    await repo.adjustCredit(user, "edit", sentinel, client);
    assert.equal(await balance(client, user), sentinel, "the write did not happen");
    assert.notEqual(await balance(other, user), sentinel, "an uncommitted balance was visible elsewhere");
  } finally {
    await client.query("ROLLBACK");
    other.release();
  }
});
