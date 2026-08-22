// Media repo tests against real Postgres.
//
// Each test runs inside a transaction that is rolled back, so the suite leaves
// the database as it found it.
import test, { after, before } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import pool from "#db";
import * as media from "#features/media/repo.next.js";

let client;
let userId;

before(async () => {
  client = await pool.connect();
  userId = (await client.query("SELECT id FROM auth.users LIMIT 1")).rows[0].id;
});

after(async () => {
  client.release();
  await pool.end();
});

async function inRollback(fn) {
  await client.query("BEGIN");
  try {
    await fn(client);
  } finally {
    await client.query("ROLLBACK");
  }
}

const draft = (over = {}) => ({
  user_id: userId,
  bucket: "images",
  path: `/test-${randomUUID()}/`,
  filename: "probe.jpg",
  mime_type: "image/jpeg",
  size_bytes: 1234,
  ...over,
});

test("insertImage returns the inserted row", async () => {
  await inRollback(async (c) => {
    const img = await media.insertImage(draft(), c);
    assert.ok(img.id);
    assert.equal(img.bucket, "images");
    assert.equal(img.size_bytes, 1234);
  });
});

// media.images names the column `checksum`; exchange calls it checksum_sha256.
// The reads alias it back so nothing above the repo sees the rename.
test("reads expose checksum under the exchange column name", async () => {
  await inRollback(async (c) => {
    const img = await media.insertImage(draft(), c);
    assert.ok("checksum_sha256" in img);
    assert.equal("checksum" in img, false);
  });
});

test("metadata defaults to an empty object rather than null", async () => {
  await inRollback(async (c) => {
    const img = await media.insertImage(draft(), c);
    assert.deepEqual(img.metadata, {});
  });
});

test("created_at is stamped on insert", async () => {
  await inRollback(async (c) => {
    const img = await media.insertImage(draft(), c);
    assert.ok(img.created_at);
  });
});

// The write is an upsert on (path, filename, user_id) - re-uploading a file
// replaces it rather than accumulating duplicates. That is the whole reason the
// unique constraint has to exist on the new table too.
test("re-uploading the same path replaces rather than duplicates", async () => {
  await inRollback(async (c) => {
    const d = draft();
    const first = await media.insertImage(d, c);
    const second = await media.insertImage({ ...d, size_bytes: 9999 }, c);
    assert.equal(second.id, first.id);
    assert.equal(second.size_bytes, 9999);

    const { rows } = await c.query(
      "SELECT count(*)::int AS n FROM media.images WHERE path = $1 AND filename = $2 AND user_id = $3",
      [d.path, d.filename, d.user_id]
    );
    assert.equal(rows[0].n, 1);
  });
});

test("getImageById reads back what insertImage wrote", async () => {
  await inRollback(async (c) => {
    const img = await media.insertImage(draft(), c);
    assert.deepEqual(await media.getImageById(img.id, c), img);
  });
});

test("listImagesByUser only returns that user's images", async () => {
  await inRollback(async (c) => {
    const mine = await media.insertImage(draft(), c);
    const rows = await media.listImagesByUser(userId, c);
    assert.ok(rows.some((r) => r.id === mine.id));
    assert.ok(rows.every((r) => r.user_id === userId));
  });
});

test("listImagesByUser is ordered newest first", async () => {
  await inRollback(async (c) => {
    const rows = await media.listImagesByUser(userId, c);
    const times = rows.map((r) => new Date(r.created_at).getTime());
    assert.deepEqual(times, [...times].sort((a, b) => b - a));
  });
});

// deleteImage takes the user id as well as the row id, so one user cannot
// delete another's upload by guessing an id.
test("deleteImage will not delete another user's image", async () => {
  await inRollback(async (c) => {
    const img = await media.insertImage(draft(), c);
    await media.deleteImage(randomUUID(), img.id, c);
    assert.ok(await media.getImageById(img.id, c), "image should survive");

    await media.deleteImage(userId, img.id, c);
    assert.equal(await media.getImageById(img.id, c), undefined);
  });
});

test("a write made with a client is invisible on the pool", async () => {
  await client.query("BEGIN");
  const img = await media.insertImage(draft(), client);
  const outside = await media.getImageById(img.id);
  await client.query("ROLLBACK");

  assert.ok(img.id);
  assert.equal(outside, undefined);
});
