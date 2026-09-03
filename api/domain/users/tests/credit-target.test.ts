// A credit adjustment that reaches nobody used to answer 200.
//
// The UPDATE is `WHERE id = $3`. A user_id matching no row updates nothing and
// returns no row, and the controller answered 200 with it - so an admin adding
// $500 to an account that does not exist was told it worked. Measured before
// the fix: a random uuid came back rowCount 0, status 200.
//
// WHAT THIS FILE DOES NOT CLAIM. The frontend cannot reach it today: it sends
// an id from a list it has just fetched. This is the gap between "the UI is
// careful" and "the API is safe", which is the same gap the rest of this
// night's authorization work has been about.
//
// CHECKED AND CLEAN while here, and worth writing down because it looked much
// worse at first: the repo's UPDATE is a CASE with no ELSE, so an unrecognised
// mode evaluates to NULL - which on a money column would be a wiped balance.
// It is not. auth.users.dorado_funds is NOT NULL DEFAULT 0 (migration 080 put
// it there in anticipation of exactly this promotion), so Postgres raises 23502
// and nothing is written; and the service refuses an unknown mode with a 400
// long before the repo is reached. Two independent guards, one of them the
// database's.

import test from "node:test";
import assert from "node:assert/strict";
import type { PoolClient } from "pg";

import { LOCKS } from "#shared/testing/locks.ts";
import { inPinnedTransaction } from "#shared/testing/pinned-pool.ts";
import * as usersService from "#domain/users/service.ts";
import * as usersRepo from "#db/users/repo.ts";
import query from "#shared/db/query.ts";

// EVERY PINNED TRANSACTION IN THIS FILE TAKES THE BALANCE LOCK. A balance
// adjustment is a locked read on auth.users held across an insert into
// payments.ledger, so files that move balances agree an order rather than
// deadlocking on whichever customer each visited first. See LOCKS.USERS.
const inPinned = <T,>(fn: (c: PoolClient) => Promise<T> | T): Promise<T> =>
  inPinnedTransaction(fn, { lock: LOCKS.USERS });


const NOBODY = "00000000-0000-0000-0000-000000000000";

test("a credit adjustment that matches no user is refused, not reported as done", async () => {
  await inPinned(async () => {
    await assert.rejects(
      () => usersService.adjustDoradoCredit({ user_id: NOBODY, op: "add", amount: 500 }),
      (err: unknown) => {
        const e = err as { statusCode?: number; message?: string; code?: string };
        assert.equal(e.statusCode, 404, "a credit that reached nobody is not a success");
        assert.match(String(e.message), /not applied to anybody/);
        return true;
      }
    );
  });
});

test("a real user is still adjusted, and by the right amount", async () => {
  await inPinned(async (client: PoolClient) => {
    const { rows } = await query(
      // auth.users on both sides since migration 118: it is where the write
      // lands and where it is read back from.
      `SELECT e.id, e.dorado_funds FROM auth.users e
        WHERE e.dorado_funds IS NOT NULL LIMIT 1`,
      [],
      client
    );
    assert.ok(rows.length, "dev has a user with a balance to adjust");
    const before = Number(rows[0].dorado_funds);

    await usersRepo.adjustCredit(rows[0].id, "add", 7.5, client);

    const { rows: after } = await query(
      `SELECT dorado_funds FROM auth.users WHERE id = $1`,
      [rows[0].id],
      client
    );
    // Read the ROW, not the status - and read it from auth.users, which the
    // write never touches. It arrives there through the mirror trigger, so this
    // assertion covers the write AND the mirror in one. Derived from the
    // balance it started at rather than a fixture, so it cannot pass against a
    // stale expectation.
    //
    // THE DELTA, ROUNDED TO SIX PLACES - not the total rounded to two. Two
    // places assumes the subject started on a whole cent, and dev balances do
    // not: this asserted 8.08 against a real 8.0846720000001 the moment the
    // subject stopped being cherry-picked. Six places is far finer than money
    // and far coarser than float error, the same reasoning as `sameMoney` in
    // replay.test.ts and `resultOf` in the service.
    assert.equal(
      Number((Number(after[0].dorado_funds) - before).toFixed(6)),
      7.5,
      "the balance moved by exactly the amount added"
    );
  });
});

test("the database refuses a NULL balance, which is what makes an unknown mode safe", async () => {
  await inPinned(async (client: PoolClient) => {
    const { rows } = await query(
      `SELECT e.id FROM auth.users e WHERE e.dorado_funds IS NOT NULL LIMIT 1`,
      [],
      client
    );
    assert.ok(rows.length);

    // The repo's CASE has no ELSE, so this evaluates to NULL. On a money
    // column that would be a wiped balance if the column allowed it.
    await assert.rejects(
      // DELIBERATELY OUTSIDE CreditMode. service.ts casts the request body's
      // `operation` with `as users.CreditMode`, so an unrecognised mode really
      // reaches the repo - this pins the refusal.
      // @ts-expect-error - an unrecognised mode is the point of this test
      () => usersRepo.adjustCredit(rows[0].id, "not-a-mode", 5, client),
      (err: unknown) => {
        const e = err as { statusCode?: number; message?: string; code?: string };
        assert.equal(e.code, "23502", "not-null violation, not a silent wipe");
        assert.match(String(e.message), /dorado_funds/);
        return true;
      },
      "if this stops throwing, the NOT NULL has been dropped and an unrecognised " +
        "mode can zero a customer's credit"
    );
  });
});

test("the service refuses an unknown mode before the repo is reached", async () => {
  await inPinned(async () => {
    await assert.rejects(
      () => usersService.adjustDoradoCredit({ user_id: NOBODY, op: "not-a-mode", amount: 5 }),
      (err: unknown) => {
        const e = err as { statusCode?: number; message?: string; code?: string };
        assert.equal(e.statusCode, 400);
        assert.match(String(e.message), /unknown credit mode/);
        return true;
      }
    );
  });
});
