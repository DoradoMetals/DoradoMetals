// A credit adjustment that reaches nobody used to answer 200.
//
// The UPDATE is `WHERE id = $3`. A user_id matching no row updates nothing and
// returns rowCount 0, and the controller answered 200 with it - so an admin
// adding $500 to an account that does not exist was told it worked. Measured
// before the fix: a random uuid came back rowCount 0, status 200.
//
// WHAT THIS FILE DOES NOT CLAIM. The frontend cannot reach it today: it sends
// an id from a list it has just fetched. This is the gap between "the UI is
// careful" and "the API is safe", which is the same gap the rest of this
// night's authorization work has been about.
//
// CHECKED AND CLEAN while here, and worth writing down because it looked much
// worse at first: the repo's UPDATE is a CASE with no ELSE, so an unrecognised
// mode evaluates to NULL - which on a money column would be a wiped balance.
// It is not. exchange.users.dorado_funds is NOT NULL DEFAULT 0, so Postgres
// raises 23502 and nothing is written; and the service refuses an unknown mode
// with a 400 long before the repo is reached. Two independent guards, one of
// them the database's.

import test from "node:test";
import assert from "node:assert/strict";

import { inPinnedTransaction } from "#shared/testing/pinned-pool.js";
import * as usersService from "#features/users/service.ts";
import * as usersRepo from "#features/users/repo.ts";
import query from "#shared/db/query.js";

const NOBODY = "00000000-0000-0000-0000-000000000000";

test("a credit adjustment that matches no user is refused, not reported as done", async () => {
  await inPinnedTransaction(async () => {
    await assert.rejects(
      () => usersService.adjustDoradoCredit({ user_id: NOBODY, mode: "add", amount: 500 }),
      (err) => {
        assert.equal(err.statusCode, 404, "a credit that reached nobody is not a success");
        assert.match(err.message, /not applied to anybody/);
        return true;
      }
    );
  });
});

test("a real user is still adjusted, and by the right amount", async () => {
  await inPinnedTransaction(async (client) => {
    const { rows } = await query(
      `SELECT id, dorado_funds FROM auth.users WHERE dorado_funds IS NOT NULL LIMIT 1`,
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
    // Read the ROW, not the status. Derived from the balance it started at
    // rather than a fixture, so it cannot pass against a stale expectation.
    assert.equal(
      Number(after[0].dorado_funds),
      Number((before + 7.5).toFixed(2)),
      "the balance moved by exactly the amount added"
    );
  });
});

test("the database refuses a NULL balance, which is what makes an unknown mode safe", async () => {
  await inPinnedTransaction(async (client) => {
    const { rows } = await query(
      `SELECT id FROM auth.users WHERE dorado_funds IS NOT NULL LIMIT 1`,
      [],
      client
    );
    assert.ok(rows.length);

    // The repo's CASE has no ELSE, so this evaluates to NULL. On a money
    // column that would be a wiped balance if the column allowed it.
    await assert.rejects(
      () => usersRepo.adjustCredit(rows[0].id, "not-a-mode", 5, client),
      (err) => {
        assert.equal(err.code, "23502", "not-null violation, not a silent wipe");
        assert.match(err.message, /dorado_funds/);
        return true;
      },
      "if this stops throwing, the NOT NULL has been dropped and an unrecognised " +
        "mode can zero a customer's credit"
    );
  });
});

test("the service refuses an unknown mode before the repo is reached", async () => {
  await inPinnedTransaction(async () => {
    await assert.rejects(
      () => usersService.adjustDoradoCredit({ user_id: NOBODY, mode: "not-a-mode", amount: 5 }),
      (err) => {
        assert.equal(err.statusCode, 400);
        assert.match(err.message, /unknown credit mode/);
        return true;
      }
    );
  });
});
