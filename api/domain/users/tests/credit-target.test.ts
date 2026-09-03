// A credit adjustment that reaches nobody used to answer 200 - a user_id
// matching no row updated nothing but reported success.
// CHECKED AND CLEAN: the repo's UPDATE is a CASE with no ELSE, so an
// unrecognised mode evaluates to NULL, but auth.users.dorado_funds is NOT
// NULL DEFAULT 0, so Postgres raises 23502 and nothing is written; the
// service also refuses an unknown mode with a 400 before the repo is reached.

import { test } from "vitest";
import assert from "node:assert/strict";
import type { PoolClient } from "pg";

import { LOCKS } from "#shared/testing/locks.ts";
import { TEST_ACTOR } from "#shared/testing/actor.ts";
import { inPinnedTransaction } from "#shared/testing/pinned-pool.ts";
import * as usersService from "#domain/users/service.ts";
import * as usersRepo from "#db/users/repo.ts";
import { aUser } from "#shared/testing/builders/index.ts";
import query from "#shared/db/query.ts";

// EVERY PINNED TRANSACTION IN THIS FILE TAKES THE BALANCE LOCK: a balance
// adjustment is a locked read on auth.users held across an insert into
// payments.ledger, so files that move balances must agree an order. See
// LOCKS.USERS.
const inPinned = <T,>(fn: (c: PoolClient) => Promise<T> | T): Promise<T> =>
  inPinnedTransaction(fn, { actor: TEST_ACTOR.id, lock: LOCKS.USERS });


const NOBODY = "00000000-0000-0000-0000-000000000000";

test("a credit adjustment that matches no user is refused, not reported as done", async () => {
  await inPinned(async () => {
    await assert.rejects(
      () => usersService.adjustDoradoCredit({ user_id: NOBODY, op: "add", amount: 500 }),
      (err: unknown) => {
        const e = err as { kind?: string; message?: string };
        assert.equal(e.kind, "not_found", "a credit that reached nobody is not a success");
        assert.match(String(e.message), /not applied to anybody/);
        return true;
      }
    );
  });
});

test("a real user is still adjusted, and by the right amount", async () => {
  await inPinned(async (client: PoolClient) => {
    // BUILT, WITH A STARTING BALANCE THAT IS NOT A WHOLE CENT. auth.users on
    // both sides since migration 118: it is where the write lands and where it
    // is read back from. The fixture used to be "the first user with a
    // balance", and the awkward starting figure is deliberate - see the delta
    // assertion below, which once asserted 8.08 against a real
    // 8.0846720000001.
    const user = await aUser(client, { funds: 0.584672 });
    const before = user.dorado_funds;

    await usersRepo.adjustCredit(user.id, "add", 7.5, client);

    const { rows: after } = await query(
      `SELECT dorado_funds FROM auth.users WHERE id = $1`,
      [user.id],
      client
    );
    // Reads from auth.users, which the write never touches - it arrives there via the mirror trigger, so this covers the write AND the mirror in one.
    // The delta rounded to six places, not the total to two: two places assumes a whole starting cent, and this once asserted 8.08 against a real 8.0846720000001.
    assert.equal(
      Number((Number(after[0].dorado_funds) - before).toFixed(6)),
      7.5,
      "the balance moved by exactly the amount added"
    );
  });
});

test("the database refuses a NULL balance, which is what makes an unknown mode safe", async () => {
  await inPinned(async (client: PoolClient) => {
    const user = await aUser(client, { funds: 100 });

    // The repo's CASE has no ELSE, so this evaluates to NULL - a wiped balance if the column allowed it.
    await assert.rejects(
      // Deliberately outside CreditMode - service.ts casts the body's `operation`, so an unrecognised mode really reaches the repo.
      // @ts-expect-error - an unrecognised mode is the point of this test
      () => usersRepo.adjustCredit(user.id, "not-a-mode", 5, client),
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
