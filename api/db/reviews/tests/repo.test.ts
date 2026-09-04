import { test, afterAll, beforeAll } from "vitest";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import type { PoolClient } from "pg";
import pool from "#pool";
import { inRollback } from "#shared/testing/rollback.ts";
import { aReview } from "#shared/testing/builders/index.ts";
import * as reviews from "#db/reviews/repo.ts";

beforeAll(async () => {
  assert.equal(
    new Date().getTimezoneOffset(), 0,
    "these tests require TZ=UTC - run them with `pnpm --filter @dorado/api test`"
  );
});

afterAll(async () => {
  await pool.end();
});

test("update writes a real review and answers the written row", async () => {
  await inRollback(async (c: PoolClient) => {
    const review = await aReview(c);

    const written = await reviews.update(review.id, { rating: 3, hidden: false }, c);
    assert.equal(written?.rating, 3);
    assert.equal(written?.hidden, false);
    assert.deepEqual(written, await reviews.getOne(review.id, c));
  });
});

test("update answers undefined for an id with no review row", async () => {
  await inRollback(async (c: PoolClient) => {
    const written = await reviews.update(randomUUID(), { rating: 1 }, c);
    assert.equal(written, undefined, "update answered a row for a review that does not exist");
  });
});

test("remove deletes a real review and answers false the second time", async () => {
  await inRollback(async (c: PoolClient) => {
    const review = await aReview(c);

    const removed = await reviews.remove(review.id, c);
    assert.equal(removed, true, "remove reported no row changed");
    assert.equal(await reviews.getOne(review.id, c), undefined);

    const removedAgain = await reviews.remove(review.id, c);
    assert.equal(removedAgain, false, "remove reported a change for a review already gone");
  });
});

test("getPublic excludes a hidden review and includes a visible one", async () => {
  await inRollback(async (c: PoolClient) => {
    const hidden = await aReview(c);
    const visible = await aReview(c, null, { hidden: false });

    const publicRows = await reviews.getPublic(c);
    const ids = publicRows.map((r) => r.id);
    assert.ok(!ids.includes(hidden.id), "a hidden review reached the public read");
    assert.ok(ids.includes(visible.id), "a visible review is missing from the public read");
  });
});
