import { test, afterAll, beforeAll } from "vitest";
import assert from "node:assert/strict";
import type { PoolClient } from "pg";
import { randomUUID } from "node:crypto";
import pool from "#pool";
import * as mediaService from "#domain/media/images/service.ts";
import * as mediaRepo from "#db/media/images/repo.ts";

let client: PoolClient;
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
  assert.ok(image.user_id, "the image has no owner, so this proves nothing");
  owner = image.user_id;
});

afterAll(async () => {
  client.release();
  await pool.end();
});

test("a stranger cannot delete somebody else's image", async () => {
  const result = await mediaService.deleteImage({
    id: image.id,
    user_id: randomUUID(),
  });
  assert.equal(result, null, "the service accepted a stranger's delete");

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

test("no user id is refused rather than matching a null owner", async () => {
  assert.equal(await mediaService.getUrlFor({ image_id: image.id }), null);
  assert.equal(await mediaService.deleteImage({ id: image.id }), null);
});
