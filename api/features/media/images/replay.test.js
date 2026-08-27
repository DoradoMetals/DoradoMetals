// The media endpoints, over real HTTP.
//
// Media is where two of this project's authorization bugs lived, and both were
// the same shape: an id arriving from the caller, behind requireUser, with
// nothing asking whose it was. A presigned URL is a download link for the
// object, so handing one out for an unchecked id hands out the file.
//
// WHAT THIS SUITE ADDED. A third one, found while writing it: /get_test_image
// was requireUser and its repo call is `SELECT ... FROM exchange.images` with
// no user scoping at all, with a presigned URL attached to every row. Any of
// the 75 signed-in accounts could enumerate and download every image in the
// system. The frontend page that calls it already declared roles: ['admin'] -
// the guard was in the UI, which is not where a guard does anything. The route
// is requireAdmin now.
//
// WHY THE REFUSALS ARE THE TESTS. The happy paths presign against MinIO, which
// is a network dependency this suite deliberately does not take. Every refusal
// returns BEFORE reaching the client, so what is asserted here is exactly the
// part that is both deterministic and worth protecting.
//
// NOTHING IS COMMITTED. shared/testing/pinned-pool.js holds every query in one
// transaction that is rolled back.
import test, { after, before } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import request from "supertest";
import pool from "#db";
import query from "#shared/db/query.js";
import { mockSessions, restoreSessions, as, anonymous } from "#shared/testing/session.ts";
import {
  inPinnedTransaction,
  assertNothingEscaped,
  outside,
} from "#shared/testing/pinned-pool.ts";

await mockSessions();
const { default: app } = await import("#app");

let admin;
let owner;
let stranger;
const created = [];

before(async () => {
  const admins = await outside(
    `SELECT id, name, email FROM exchange.users WHERE role = 'admin' LIMIT 1`
  );
  admin = admins[0];
  assert.ok(admin, "dev has no admin user");

  const users = await outside(
    `SELECT id, name, email FROM exchange.users WHERE role IS DISTINCT FROM 'admin' LIMIT 2`
  );
  [owner, stranger] = users;
  assert.ok(owner && stranger, "dev needs two non-admin users to test one against the other");
  assert.notEqual(owner.id, stranger.id, "the owner and the stranger are the same person");
});

after(async () => {
  restoreSessions();
  await pool.end();
});

// An image belonging to `owner`, created inside the pin so it is rolled back.
// Written directly rather than through /upload because /upload presigns.
async function imageFor(userId) {
  const filename = `replay-${randomUUID().slice(0, 8)}.jpg`;
  created.push(filename);
  // BOTH SCHEMAS, under one id. Reads come from media.images since the
  // restructure, so a fixture that writes only exchange creates an image the
  // API cannot see - which is a broken fixture, not a broken endpoint.
  const { rows } = await query(
    `INSERT INTO media.images (user_id, bucket, path, filename, mime_type, size_bytes)
     VALUES ($1, $2, $3, $4, $5, $6) RETURNING id`,
    [userId, "replay-bucket", "/replay/", filename, "image/jpeg", 1234]
  );
  await query(
    `INSERT INTO exchange.images (id, user_id, bucket, path, filename, mime_type, size_bytes)
     VALUES ($1, $2, $3, $4, $5, $6, $7)`,
    [rows[0].id, userId, "replay-bucket", "/replay/", filename, "image/jpeg", 1234]
  );
  return { id: rows[0].id, filename };
}

test("every route refuses an anonymous caller", async () => {
  await inPinnedTransaction(async () => {
    await anonymous(async () => {
      const calls = [
        ["upload", request(app).post("/api/images/upload").send({ filename: "x.jpg" })],
        ["get_test_image", request(app).get("/api/images/get_test_image")],
        ["get_url", request(app).get("/api/images/get_url").query({ image_id: randomUUID() })],
        ["delete", request(app).delete("/api/images/delete").send({ id: randomUUID() })],
      ];
      for (const [name, call] of calls) {
        const res = await call;
        assert.ok([401, 403].includes(res.status), `${name} answered ${res.status} anonymously`);
      }
    });
  });
});

// THE FIX THIS SUITE FOUND. A signed-in customer must not be able to list every
// image in the system. Before, this answered 200 with a presigned download URL
// for each row.
test("a signed-in customer cannot list every image in the system", async () => {
  await inPinnedTransaction(async () => {
    await as({ ...owner, role: "user" }, async () => {
      const res = await request(app).get("/api/images/get_test_image");
      assert.ok(
        [401, 403].includes(res.status),
        `get_test_image answered ${res.status} to a customer - it lists every image there is`
      );
      // Belt and braces: whatever came back, it must not be a list of images
      // with URLs attached.
      assert.ok(
        !Array.isArray(res.body) || res.body.length === 0,
        "a refused caller still received image rows"
      );
    });
  });
});

// The ownership check on the presigned GET. "Does not exist" and "is not yours"
// are deliberately the same answer, so this asserts 404 for both.
test("a stranger cannot get a download URL for someone else's image", async () => {
  await inPinnedTransaction(async () => {
    const image = await imageFor(owner.id);

    await as({ ...stranger, role: "user" }, async () => {
      const res = await request(app).get("/api/images/get_url").query({ image_id: image.id });
      assert.equal(res.status, 404, "a stranger was given a download URL for another user's file");
    });

    await as({ ...stranger, role: "user" }, async () => {
      const res = await request(app).get("/api/images/get_url").query({ image_id: randomUUID() });
      assert.equal(res.status, 404, "a missing image answers differently from a forbidden one");
    });
  });
});

// THE ONE THAT MATTERS MOST. The old bug removed the object from storage FIRST
// and only then ran a DELETE that was scoped to the user - so a stranger's
// request destroyed the file, matched no row, and returned success.
//
// Asserting the 404 alone would not have caught that: the response was wrong
// too, but the damage was to the file. Checking the row still exists is what
// distinguishes "refused" from "deleted the file and failed to delete the row".
test("a stranger deleting someone else's image is refused and the row survives", async () => {
  await inPinnedTransaction(async () => {
    const image = await imageFor(owner.id);

    await as({ ...stranger, role: "user" }, async () => {
      const res = await request(app).delete("/api/images/delete").send({ id: image.id });
      assert.equal(res.status, 404, `a stranger got ${res.status} deleting another user's image`);
    });

    const { rows } = await query(`SELECT id FROM exchange.images WHERE id = $1`, [image.id]);
    assert.equal(rows.length, 1, "the stranger's delete removed the row anyway");
  });
});

// The counterpart, so the test above is a refusal rather than the endpoint
// being broken for everyone. Deliberately asserts only that the row is gone -
// the object removal is MinIO's and is not exercised here.
test("the owner can delete their own image", async () => {
  await inPinnedTransaction(async () => {
    const image = await imageFor(owner.id);

    await as({ ...owner, role: "user" }, async () => {
      const res = await request(app).delete("/api/images/delete").send({ id: image.id });
      assert.ok(
        [200, 500].includes(res.status),
        `the owner got ${res.status} deleting their own image`
      );

      // A 500 here means the row was authorised and removed and MinIO was then
      // unreachable, which is the documented order: database first, outside
      // world after. That is a pass for what this file is testing.
      const { rows } = await query(`SELECT id FROM exchange.images WHERE id = $1`, [image.id]);
      assert.equal(rows.length, 0, "the owner's own delete left the row behind");
    });
  });
});

test("nothing this file created survived the transaction", async () => {
  assert.ok(created.length > 0, "no image was created, so this proves nothing");
  for (const filename of created) {
    assert.equal(
      await assertNothingEscaped("exchange.images", "filename = $1", [filename]),
      0,
      `${filename} was committed to dev`
    );
  }
});
