import { test } from "vitest";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { inPinnedTransaction } from "#shared/testing/pinned-pool.ts";
import { TEST_ACTOR } from "#shared/testing/actor.ts";
import * as reviews from "#db/reviews/repo.ts";

test("update returns undefined for an id nothing names", async () => {
  await inPinnedTransaction(async (client) => {
    const written = await reviews.update(
      randomUUID(),
      { review_text: "should not land anywhere" },
      client
    );
    assert.equal(written, undefined, "an update against a missing id answered a row");
  }, { actor: TEST_ACTOR.id });
});

test("update answers the written row for a real id, with the change on it", async () => {
  await inPinnedTransaction(async (client) => {
    const created = await reviews.create({ name: "Repo Fixture", hidden: false }, client);

    const written = await reviews.update(
      created.id, { review_text: "touched by repo.test.ts" }, client
    );
    assert.equal(written?.review_text, "touched by repo.test.ts");
    assert.deepEqual(written, await reviews.getOne(created.id, client));
  }, { actor: TEST_ACTOR.id });
});
