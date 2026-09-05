import { test, afterAll } from "vitest";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import pool from "#pool";
import { TEST_ACTOR } from "#shared/testing/actor.ts";
import { inPinnedTransaction } from "#shared/testing/pinned-pool.ts";
import { LOCKS } from "#shared/testing/locks.ts";
import { aUser, aPayout } from "#shared/testing/builders/index.ts";
import * as service from "#domain/payments/details/service.ts";

afterAll(async () => {
  await pool.end();
});

test("getOne reads back a payout's view by id", async () => {
  await inPinnedTransaction(async (c) => {
    const user = await aUser(c);
    const payout = await aPayout(c, user);

    const view = await service.getOne(payout.id);
    assert.ok(view, "a real payout id resolved to nothing");
    assert.equal(view.account_holder, payout.account_holder);
    assert.equal(view.last_four, payout.last_four);
  }, { actor: TEST_ACTOR.id, lock: LOCKS.ORDERS });
});

test("getOne resolves to nothing for an id nothing names", async () => {
  const view = await service.getOne(randomUUID());
  assert.equal(view, undefined);
});
