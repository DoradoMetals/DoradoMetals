// Writes on reviews.reviews, against real Postgres. Self-contained: a review
// has no foreign key of its own (order_id/user_id are set afterward by
// whoever links it), so no lock is required.
import { test, afterAll, beforeAll } from "vitest";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import type { PoolClient } from "pg";
import pool from "#db";
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

test("update writes a real review and answers true", async () => {
  await inRollback(async (c: PoolClient) => {
    const review = await aReview(c);

    const changed = await reviews.update(review.id, { rating: 3, hidden: false }, c);
    assert.equal(changed, true, "update reported no row changed");

    const after = await reviews.getOne(review.id, c);
    assert.equal(after?.rating, 3);
    assert.equal(after?.hidden, false);
  });
});

test("update answers false for an id with no review row", async () => {
  await inRollback(async (c: PoolClient) => {
    const changed = await reviews.update(randomUUID(), { rating: 1 }, c);
    assert.equal(changed, false, "update reported a change for a review that does not exist");
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

// getPublic is a separate statement, not list() with a filter (see
// sql/get_public.sql) - aReview defaults hidden to true precisely so a
// fixture never adds itself to what the public sees, so this proves both
// halves of that at once.
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
