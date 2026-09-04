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

const inPinned = <T,>(fn: (c: PoolClient) => Promise<T> | T): Promise<T> =>
  inPinnedTransaction(fn, { actor: TEST_ACTOR.id, lock: LOCKS.USERS });

const NOBODY = "00000000-0000-0000-0000-000000000000";

test("a credit adjustment that matches no user is refused, not reported as done", async () => {
  await inPinned(async () => {
    await assert.rejects(
      () => usersService.adjustDoradoCredit(NOBODY, { op: "add", amount: 500 }),
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
    const user = await aUser(client, { funds: 0.584672 });
    const before = user.dorado_funds;

    await usersRepo.adjustCredit(user.id, "add", 7.5, client);

    const { rows: after } = await query(
      `SELECT dorado_funds FROM auth.users WHERE id = $1`,
      [user.id],
      client
    );
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

    await assert.rejects(
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
