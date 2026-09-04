// The media endpoints, over real HTTP. Media held two authorization bugs of
// the same shape: an id from the caller, behind requireUser, with nothing
// checking whose it was - a presigned URL is a download link, so an
// unchecked id hands out the file.
//
// A third was found writing this suite: GET /images (requireUser) read
// media.images with no user scoping and a presigned URL on every row - any
// signed-in account could enumerate and download every image in the system.
// The route is requireAdmin now.
//
// Happy paths presign against real MinIO, a network dependency this suite
// doesn't take - every refusal returns BEFORE reaching the client, so
// refusals are what's asserted. NOTHING IS COMMITTED: pinned-pool.ts rolls
// back every query.
import { test, afterAll, beforeAll } from "vitest";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import request from "supertest";
import pool from "#pool";
import query from "#shared/db/query.ts";
import { mockSessions, restoreSessions, as, anonymous } from "#shared/testing/session.ts";
import { TEST_ACTOR } from "#shared/testing/actor.ts";
import {
  inPinnedTransaction,
  assertNothingEscaped,
  outside,
} from "#shared/testing/pinned-pool.ts";

await mockSessions();
const { default: app } = await import("#app");

// SELECT projections, not table rows - naming a row type would claim columns the query never asked for.
type UserFixture = { id: string; name: string | null; email: string | null };
let admin: UserFixture;
let owner: UserFixture;
let stranger: UserFixture;
const created: string[] = [];

beforeAll(async () => {
  const admins = await outside<UserFixture>(
    `SELECT id, name, email FROM auth.users WHERE role = 'admin' LIMIT 1`
  );
  admin = admins[0];
  assert.ok(admin, "dev has no admin user");

  const users = await outside<UserFixture>(
    `SELECT id, name, email FROM auth.users WHERE role IS DISTINCT FROM 'admin' LIMIT 2`
  );
  [owner, stranger] = users;
  assert.ok(owner && stranger, "dev needs two non-admin users to test one against the other");
  assert.notEqual(owner.id, stranger.id, "the owner and the stranger are the same person");
});

afterAll(async () => {
  restoreSessions();
  await pool.end();
});

// An image belonging to `owner`, created inside the pin (rolled back) - written directly since POST /images presigns.
async function imageFor(userId: string) {
  const filename = `replay-${randomUUID().slice(0, 8)}.jpg`;
  created.push(filename);
  const { rows } = await query(
    `INSERT INTO media.images (user_id, bucket, path, filename, mime_type, size_bytes)
     VALUES ($1, $2, $3, $4, $5, $6) RETURNING id`,
    [userId, "replay-bucket", "/replay/", filename, "image/jpeg", 1234]
  );
  return { id: rows[0].id, filename };
}

test("every route refuses an anonymous caller", async () => {
  await inPinnedTransaction(async () => {
    await anonymous(async () => {
      const calls = [
        ["upload", request(app).post("/api/images").send({ filename: "x.jpg" })],
        ["list", request(app).get("/api/images")],
        ["get_url", request(app).get(`/api/images/${randomUUID()}/url`)],
        ["delete", request(app).delete(`/api/images/${randomUUID()}`)],
      ] as Array<[string, Promise<{ status: number }>]>;
      // Declared as a tuple list - inferred, the element type collapses to `string | Test` and neither half is usable.
      for (const [name, call] of calls) {
        const res = await call;
        assert.ok([401, 403].includes(res.status), `${name} answered ${res.status} anonymously`);
      }
    });
  }, { actor: TEST_ACTOR.id });
});

// The fix this suite found: a signed-in customer must not list every image in the system - before, this answered 200 with a presigned URL for each row.
test("a signed-in customer cannot list every image in the system", async () => {
  await inPinnedTransaction(async () => {
    await as({ ...owner, role: "user" }, async () => {
      const res = await request(app).get("/api/images");
      assert.ok(
        [401, 403].includes(res.status),
        `list answered ${res.status} to a customer - it lists every image there is`
      );
      // Belt and braces: whatever came back must not be a list of images with URLs attached.
      assert.ok(
        !Array.isArray(res.body) || res.body.length === 0,
        "a refused caller still received image rows"
      );
    });
  }, { actor: TEST_ACTOR.id });
});

// The ownership check on the presigned GET - "does not exist" and "is not yours" are deliberately the same answer (404) for both.
test("a stranger cannot get a download URL for someone else's image", async () => {
  await inPinnedTransaction(async () => {
    const image = await imageFor(owner.id);

    await as({ ...stranger, role: "user" }, async () => {
      const res = await request(app).get(`/api/images/${image.id}/url`);
      assert.equal(res.status, 404, "a stranger was given a download URL for another user's file");
    });

    await as({ ...stranger, role: "user" }, async () => {
      const res = await request(app).get(`/api/images/${randomUUID()}/url`);
      assert.equal(res.status, 404, "a missing image answers differently from a forbidden one");
    });
  }, { actor: TEST_ACTOR.id });
});

// The one that matters most: the old bug removed the object first, then ran a scoped DELETE - a stranger's request destroyed the file, matched no row, and returned success.
// Asserting 404 alone wouldn't catch that (the damage was to the file) - checking the row still exists is what distinguishes refused from deleted-the-file-anyway.
test("a stranger deleting someone else's image is refused and the row survives", async () => {
  await inPinnedTransaction(async () => {
    const image = await imageFor(owner.id);

    await as({ ...stranger, role: "user" }, async () => {
      const res = await request(app).delete(`/api/images/${image.id}`);
      assert.equal(res.status, 404, `a stranger got ${res.status} deleting another user's image`);
    });

    const { rows } = await query(`SELECT id FROM media.images WHERE id = $1`, [image.id]);
    assert.equal(rows.length, 1, "the stranger's delete removed the row anyway");
  }, { actor: TEST_ACTOR.id });
});

// The counterpart, so the test above is a refusal rather than the endpoint being broken for everyone - asserts only that the row is gone; object removal is MinIO's and isn't exercised here.
test("the owner can delete their own image", async () => {
  await inPinnedTransaction(async () => {
    const image = await imageFor(owner.id);

    await as({ ...owner, role: "user" }, async () => {
      const res = await request(app).delete(`/api/images/${image.id}`);
      assert.ok(
        [200, 500].includes(res.status),
        `the owner got ${res.status} deleting their own image`
      );

      // A 500 here means the row was removed and MinIO was then unreachable - database first, outside world after - which is a pass for what this file tests.
      const { rows } = await query(`SELECT id FROM media.images WHERE id = $1`, [image.id]);
      assert.equal(rows.length, 0, "the owner's own delete left the row behind");
    });
  }, { actor: TEST_ACTOR.id });
});

test("nothing this file created survived the transaction", async () => {
  assert.ok(created.length > 0, "no image was created, so this proves nothing");
  for (const filename of created) {
    assert.equal(
      await assertNothingEscaped("media.images", "filename = $1", [filename]),
      0,
      `${filename} was committed to dev`
    );
  }
});
