// The admin balance edit, against real Postgres.
//
// adjustUserCredit is the other half of the money path: transactions.addFunds
// and removeFunds move a balance during checkout, this is an admin setting one
// by hand. It has three modes and no guard rails, which is worth stating.
//
// *** THIS FILE USED TO EXERCISE THE WRONG STATEMENT. *** Until seam 2
// (docs/waves/seams.md) `features/users/repo.ts` `adjustCredit` wrote
// auth.users and was called by nothing but these tests, while the statement
// the application actually ran sat under `api/legacy/`. Every assertion here
// passed against an implementation no request ever reached. The two are now
// one function, writing exchange.users - so what follows pins the live path.
//
// IT ALSO PINS THE MIRROR, for free and deliberately: the write goes to
// exchange.users and every balance below is read back from auth.users. If the
// `mirror_users_to_auth` trigger is ever dropped, these fail.
import test, { after, before } from "node:test";
import assert from "node:assert/strict";
import type { PoolClient } from "pg";
import pool from "#db";
import * as repo from "#db/users/repo.ts";

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
  try {
    await fn(client);
  } finally {
    await client.query("ROLLBACK");
  }
}

// A user that exists in BOTH tables. The write lands in exchange.users and the
// balance is read back from auth.users, so a subject present in only one of
// them would make every assertion here meaningless - and dev has three such
// rows (one exchange-only, two auth-only). Picking blind from auth.users was
// how this test could have written nothing and still passed.
const aUser = async (c: PoolClient) =>
  (await c.query(
    `SELECT e.id FROM exchange.users e JOIN auth.users a ON a.id = e.id
      ORDER BY e.id LIMIT 1`
  )).rows[0].id;

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

// `edit` sets rather than adjusts, which is the mode most likely to be picked
// by mistake: passing the amount someone meant to add replaces their balance
// with it instead.
test("edit replaces the balance rather than adjusting it", async () => {
  await inRollback(async (c: PoolClient) => {
    const user = await aUser(c);
    await repo.adjustCredit(user, "add", 500, c);
    await repo.adjustCredit(user, "edit", 25, c);
    assert.equal(await balance(c, user), 25);
  });
});

// dorado_funds is NOT NULL DEFAULT 0 on BOTH tables (migration 080 gave the
// mirror the same constraint), so a user always has a balance to adjust and the
// COALESCE in the query is belt and braces rather than load-bearing.
test("every user has a balance to adjust, never null", async () => {
  await inRollback(async (c: PoolClient) => {
    const { rows } = await c.query(
      "SELECT count(*) FILTER (WHERE dorado_funds IS NULL)::int nulls FROM auth.users"
    );
    assert.equal(rows[0].nulls, 0);
  });
});

// The CASE in the query has no ELSE, so an unrecognised mode evaluates to NULL.
// I expected that to blank the balance silently; it does not, because the
// column is NOT NULL and the database refuses the update. The constraint is
// what makes a typo in the mode an error rather than a wiped balance - worth
// knowing before anyone relaxes it, or adds a fourth mode.
test("an unrecognised mode is refused rather than blanking the balance", async () => {
  await inRollback(async (c: PoolClient) => {
    const user = await aUser(c);
    await repo.adjustCredit(user, "add", 200, c);
    const before = await balance(c, user);

    await assert.rejects(
      // DELIBERATELY OUTSIDE CreditMode ("add" | "subtract" | "edit"). The
      // mode arrives from a request body - service.ts casts it with
      // `operation as users.CreditMode` - so an unrecognised one really can
      // reach here, and this pins that it is refused. @ts-expect-error rather
      // than a cast: it fails if the parameter is ever widened.
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
