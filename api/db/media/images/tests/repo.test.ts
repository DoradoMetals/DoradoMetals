import { test, afterAll, beforeAll } from "vitest";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import type { PoolClient } from "pg";
import pool from "#pool";
import { inRollback } from "#shared/testing/rollback.ts";
import { aUser } from "#shared/testing/builders/index.ts";
import * as images from "#db/media/images/repo.ts";

beforeAll(async () => {
  assert.equal(
    new Date().getTimezoneOffset(), 0,
    "these tests require TZ=UTC - run them with `pnpm --filter @dorado/api test`"
  );
});

afterAll(async () => {
  await pool.end();
});

const anImage = (user_id: string) => ({
  user_id, bucket: "test-bucket", path: `fixtures/${randomUUID()}`,
  filename: "swatch.png", mime_type: "image/png", size_bytes: 128,
});

test("create writes a real image, and the same (path, filename, user_id) again returns the same row", async () => {
  await inRollback(async (c: PoolClient) => {
    const user = await aUser(c);
    const image = anImage(user.id);
    const id = randomUUID();

    const created = await images.create(id, image, c);
    assert.equal(created.id, id);

    const again = await images.create(randomUUID(), image, c);
    assert.equal(again.id, created.id, "a retried upload created a second row");

    const all = await images.list(c);
    assert.equal(all.filter((i) => i.id === created.id).length, 1);
  });
});

test("remove deletes a real image scoped to its owner, and answers false the second time", async () => {
  await inRollback(async (c: PoolClient) => {
    const owner = await aUser(c);
    const created = await images.create(randomUUID(), anImage(owner.id), c);

    const removed = await images.remove(created.id, owner.id, c);
    assert.equal(removed, true, "remove reported no row changed");
    assert.equal(await images.getOne(created.id, c), undefined);

    const removedAgain = await images.remove(created.id, owner.id, c);
    assert.equal(removedAgain, false, "remove reported a change for an image already gone");
  });
});

test("remove answers false for someone else's image - the ownership check is the WHERE clause", async () => {
  await inRollback(async (c: PoolClient) => {
    const owner = await aUser(c);
    const stranger = await aUser(c);
    const created = await images.create(randomUUID(), anImage(owner.id), c);

    const removed = await images.remove(created.id, stranger.id, c);
    assert.equal(removed, false, "a stranger was able to delete somebody else's image");
    assert.ok(await images.getOne(created.id, c), "the image was deleted despite the owner mismatch");
  });
});

test("remove answers false for an id with no image row", async () => {
  await inRollback(async (c: PoolClient) => {
    const owner = await aUser(c);
    const removed = await images.remove(randomUUID(), owner.id, c);
    assert.equal(removed, false, "remove reported a change for an image that does not exist");
  });
});
