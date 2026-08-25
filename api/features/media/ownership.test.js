// Whether an image's owner is the only person who can fetch or destroy it.
//
// These do NOT go through HTTP and do NOT touch object storage. deleteImage
// removes a real file from MinIO, and a test that exercised it would either
// delete somebody's image or need a live bucket - so what is asserted is that
// the guard refuses BEFORE anything irreversible happens, by giving the service
// a stranger's id and checking it returns null having touched nothing.
//
// WHAT WAS WRONG. The service read the image by id with no ownership check,
// removed the object from storage unconditionally, and only then ran a DELETE
// that IS scoped to the user. A signed-in caller posting somebody else's image
// id destroyed the real file, left the row pointing at nothing, and got
// { success: true }.
//
// repo.next.test.js has "deleteImage will not delete another user's image" and
// it passes: it tests the repo, whose DELETE is correctly scoped. The bug was
// one layer up. That is the thing worth remembering - a test can prove the
// right property about the wrong layer and read as coverage.
import test, { after, before } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import pool from "#db";
import * as mediaService from "#features/media/service.js";
import * as mediaRepo from "#features/media/repo.js";

let client;
let image;
let owner;

before(async () => {
  client = await pool.connect();
  const { rows } = await client.query(
    `SELECT id, user_id FROM media.images ORDER BY created_at ASC, id ASC LIMIT 1`
  );
  image = rows[0];
  assert.ok(image, "dev has no image to check ownership against");
  owner = image.user_id;
  assert.ok(owner, "the image has no owner, so this proves nothing");
});

after(async () => {
  client.release();
  await pool.end();
});

// The destructive one. A stranger must be refused before minio.removeObject is
// reached; if the guard were absent this call would delete a real file.
test("a stranger cannot delete somebody else's image", async () => {
  const result = await mediaService.deleteImage({
    id: image.id,
    user_id: randomUUID(),
  });
  assert.equal(result, null, "the service accepted a stranger's delete");

  // And the row is still there, which is what the old code would ALSO have
  // shown - the row survived while the file did not. Asserted anyway, because
  // a fix that deleted the row instead would be a different bug.
  const still = await mediaRepo.getImageById(image.id);
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
