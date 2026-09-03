// The leads repo itself, against real Postgres.
// The one thing worth proving directly rather than through HTTP: `update` answers a trustworthy boolean - false for an id nobody has, true for one that changed.
import { test } from "vitest";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { inPinnedTransaction } from "#shared/testing/pinned-pool.ts";
import { TEST_ACTOR } from "#shared/testing/actor.ts";
import * as leads from "#db/leads/repo.ts";

test("update returns false for an id nothing names", async () => {
  await inPinnedTransaction(async (client) => {
    const changed = await leads.update(
      randomUUID(),
      { notes: "should not land anywhere" },
      client
    );
    assert.equal(changed, false, "an update against a missing id reported a change");
  }, { actor: TEST_ACTOR.id });
});

test("update returns true for a real id, and the row actually changed", async () => {
  await inPinnedTransaction(async (client) => {
    const created = await leads.create(
      { name: "Repo Fixture", phone: null, email: null },
      client
    );

    const changed = await leads.update(
      created.id, { notes: "touched by repo.test.ts" }, client
    );
    assert.equal(changed, true, "an update against a real id reported no change");

    const row = await leads.getOne(created.id, client);
    assert.equal(row?.notes, "touched by repo.test.ts");
  }, { actor: TEST_ACTOR.id });
});
