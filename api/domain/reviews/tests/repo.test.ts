// The reviews repo itself, against real Postgres.
//
// The one thing worth proving directly rather than through HTTP: `update`
// answers a BOOLEAN (D209/D212's CRUD ruling) - false for an id nobody has,
// true for one that changed. Everything else is exercised end to end in
// endpoints.test.ts and replay.test.ts.
import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { inPinnedTransaction } from "#shared/testing/pinned-pool.ts";
import * as reviews from "#db/reviews/repo.ts";

test("update returns false for an id nothing names", async () => {
  await inPinnedTransaction(async (client) => {
    const changed = await reviews.update(
      randomUUID(),
      { review_text: "should not land anywhere" },
      client
    );
    assert.equal(changed, false, "an update against a missing id reported a change");
  });
});

test("update returns true for a real id, and the row actually changed", async () => {
  await inPinnedTransaction(async (client) => {
    const created = await reviews.create({ name: "Repo Fixture", hidden: false }, client);

    const changed = await reviews.update(created.id, { review_text: "touched by repo.test.ts" }, client);
    assert.equal(changed, true, "an update against a real id reported no change");

    const row = await reviews.getOne(created.id, client);
    assert.equal(row?.review_text, "touched by repo.test.ts");
  });
});
