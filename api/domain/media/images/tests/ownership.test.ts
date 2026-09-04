// Whether an image's owner is the only person who can fetch or destroy it. These do NOT go through HTTP or touch object storage - deleteImage removes a real MinIO file, so what's asserted is that the guard refuses BEFORE anything irreversible, given a stranger's id.
// WHAT WAS WRONG: the service removed the object from storage unconditionally, then ran a DELETE correctly scoped to the user - so a stranger's request destroyed the real file, left the row pointing at nothing, and returned { success: true }.
// The repo's own test passed throughout (its DELETE was always correctly scoped) - the bug was one layer up. A test can prove the right property about the wrong layer and read as coverage.
import { test, afterAll, beforeAll } from "vitest";
import assert from "node:assert/strict";
import type { PoolClient } from "pg";
import { randomUUID } from "node:crypto";
import pool from "#pool";
import * as mediaService from "#domain/media/images/service.ts";
import * as mediaRepo from "#db/media/images/repo.ts";

let client: PoolClient;
// The structural subset the fixture query asks for.
type ImageFixture = { id: string; user_id: string | null };

let image: ImageFixture;
let owner: string;

beforeAll(async () => {
  client = await pool.connect();
  const { rows } = await client.query(
    `SELECT id, user_id FROM media.images ORDER BY created_at ASC, id ASC LIMIT 1`
  );
  image = rows[0];
  assert.ok(image, "dev has no image to check ownership against");
  // Asserted BEFORE the assignment so `owner` is a string from here on - the two service calls below cannot be handed a null.
  assert.ok(image.user_id, "the image has no owner, so this proves nothing");
  owner = image.user_id;
});

afterAll(async () => {
  client.release();
  await pool.end();
});

// The destructive one: a stranger must be refused before minio.removeObject is reached - without the guard, this call would delete a real file.
test("a stranger cannot delete somebody else's image", async () => {
  const result = await mediaService.deleteImage({
    id: image.id,
    user_id: randomUUID(),
  });
  assert.equal(result, null, "the service accepted a stranger's delete");

  // The row survived too - the old bug would have shown this same result while the file did not; asserted anyway since deleting the row instead would be a different bug.
  const still = await mediaRepo.getOne(image.id);
  assert.ok(still, "the image row was deleted by a stranger");
});

test("a stranger cannot get a download URL for somebody else's image", async () => {
  const url = await mediaService.getUrlFor({
    image_id: image.id,
    user_id: randomUUID(),
  });
  assert.equal(url, null, "a presigned download URL was handed to a stranger");
});

test("a missing image and somebody else's image answer the same way", async () => {
  const missing = await mediaService.getUrlFor({
    image_id: randomUUID(),
    user_id: owner,
  });
  const notMine = await mediaService.getUrlFor({
    image_id: image.id,
    user_id: randomUUID(),
  });
  assert.equal(missing, null);
  assert.equal(notMine, null);
});

// A caller with no user at all must not be treated as matching a null owner.
test("no user id is refused rather than matching a null owner", async () => {
  assert.equal(await mediaService.getUrlFor({ image_id: image.id }), null);
  assert.equal(await mediaService.deleteImage({ id: image.id }), null);
});
