import { test, afterAll, beforeAll } from "vitest";
import assert from "node:assert/strict";
import type { PoolClient } from "pg";
import pool from "#pool";
import * as repo from "#db/users/repo.ts";
import { takeLocks, LOCKS } from "#shared/testing/locks.ts";
import { rollbackIn } from "#shared/testing/rollback.ts";
import { TEST_ACTOR } from "#shared/testing/actor.ts";
import { aUser as buildUser } from "#shared/testing/builders/index.ts";

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

const aUser = async (c: PoolClient) => (await buildUser(c, { funds: 0 })).id;

const balance = async (c: PoolClient, id: string) =>
  Number((await c.query("SELECT dorado_funds FROM auth.users WHERE id = $1", [id])).rows[0].dorado_funds ?? 0);

test("add increases the balance", async () => {
  await inRollback(async (c: PoolClient) => {
    const user = await aUser(c);
    assert.equal(await balance(c, user), 0, "a built customer does not start at zero");
    await repo.adjustCredit(user, "add", 150, c);
    assert.equal(await balance(c, user), 150);
  });
});

test("subtract decreases it", async () => {
  await inRollback(async (c: PoolClient) => {
    const user = await aUser(c);
    await repo.adjustCredit(user, "add", 200, c);
    await repo.adjustCredit(user, "subtract", 50, c);
    assert.equal(await balance(c, user), 150);
  });
});

test("edit replaces the balance rather than adjusting it", async () => {
  await inRollback(async (c: PoolClient) => {
    const user = await aUser(c);
    await repo.adjustCredit(user, "add", 500, c);
    await repo.adjustCredit(user, "edit", 25, c);
    assert.equal(await balance(c, user), 25);
  });
});

test("every user has a balance to adjust, never null", async () => {
  await inRollback(async (c: PoolClient) => {
    const { rows } = await c.query(
      "SELECT count(*) FILTER (WHERE dorado_funds IS NULL)::int nulls FROM auth.users"
    );
    assert.equal(rows[0].nulls, 0);
  });
});

test("an unrecognised mode is refused rather than blanking the balance", async () => {
  await inRollback(async (c: PoolClient) => {
    const user = await aUser(c);
    await repo.adjustCredit(user, "add", 200, c);
    const before = await balance(c, user);

    await c.query("SAVEPOINT before_bad_mode");
    await assert.rejects(
      // @ts-expect-error - an unrecognised mode is the point of this test
      () => repo.adjustCredit(user, "increment", 10, c),
      /not-null|null value/i,
      "an unrecognised mode was accepted"
    );
    await c.query("ROLLBACK TO SAVEPOINT before_bad_mode");

    assert.equal(await balance(c, user), before, "the refused write moved the balance");
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
  const client = await pool.connect();
  await client.query("BEGIN");
  await takeLocks(client, LOCKS.USERS);
  try {
    const user = TEST_ACTOR.id;
    const sentinel = 123456.78;
    await repo.adjustCredit(user, "edit", sentinel, client);
    assert.equal(await balance(client, user), sentinel, "the write did not happen");
    assert.notEqual(await balance(other, user), sentinel, "an uncommitted balance was visible elsewhere");
  } finally {
    await client.query("ROLLBACK");
    client.release();
    other.release();
  }
});
