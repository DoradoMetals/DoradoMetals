// A credit adjustment that reaches nobody used to answer 200 - a user_id matching no row updated nothing but reported success.
// Two independent guards catch an unrecognised mode: exchange.users.dorado_funds is NOT NULL (Postgres refuses the write), and the service refuses with a 400 before the repo is reached.

import test from "node:test";
import assert from "node:assert/strict";
import type { PoolClient } from "pg";

import { LOCKS } from "#shared/testing/locks.ts";
import { inPinnedTransaction } from "#shared/testing/pinned-pool.ts";
import * as usersService from "#domain/users/service.ts";
import * as usersRepo from "#db/users/repo.ts";
import query from "#shared/db/query.ts";

// Every pinned transaction here takes the balance lock: a balance write is two row locks (exchange.users, and auth.users via the mirror trigger), so files that move balances must agree an order.
const inPinned = <T,>(fn: (c: PoolClient) => Promise<T> | T): Promise<T> =>
  inPinnedTransaction(fn, { lock: LOCKS.USERS });


const NOBODY = "00000000-0000-0000-0000-000000000000";

test("a credit adjustment that matches no user is refused, not reported as done", async () => {
  await inPinned(async () => {
    await assert.rejects(
      () => usersService.adjustDoradoCredit({ user_id: NOBODY, mode: "add", amount: 500 }),
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
      // exchange.users is where the write lands; joined to auth.users, where it's read back from.
      `SELECT e.id, e.dorado_funds FROM exchange.users e
         JOIN auth.users a ON a.id = e.id
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
    const { rows } = await query(
      `SELECT e.id FROM exchange.users e JOIN auth.users a ON a.id = e.id
        WHERE e.dorado_funds IS NOT NULL LIMIT 1`,
      [],
      client
    );
    assert.ok(rows.length);

    // The repo's CASE has no ELSE, so this evaluates to NULL - a wiped balance if the column allowed it.
    await assert.rejects(
      // Deliberately outside CreditMode - service.ts casts the body's `operation`, so an unrecognised mode really reaches the repo.
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
      () => usersService.adjustDoradoCredit({ user_id: NOBODY, mode: "not-a-mode", amount: 5 }),
      (err: unknown) => {
        const e = err as { statusCode?: number; message?: string; code?: string };
        assert.equal(e.statusCode, 400);
        assert.match(String(e.message), /unknown credit mode/);
        return true;
      }
    );
  });
});
