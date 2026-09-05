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
      for (const [name, call] of calls) {
        const res = await call;
        assert.ok([401, 403].includes(res.status), `${name} answered ${res.status} anonymously`);
      }
    });
  }, { actor: TEST_ACTOR.id });
});

test("a signed-in customer cannot list every image in the system", async () => {
  await inPinnedTransaction(async () => {
    await as({ ...owner, role: "user" }, async () => {
      const res = await request(app).get("/api/images");
      assert.ok(
        [401, 403].includes(res.status),
        `list answered ${res.status} to a customer - it lists every image there is`
      );
      assert.ok(
        !Array.isArray(res.body) || res.body.length === 0,
        "a refused caller still received image rows"
      );
    });
  }, { actor: TEST_ACTOR.id });
});

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

test("the owner can delete their own image", async () => {
  await inPinnedTransaction(async () => {
    const image = await imageFor(owner.id);

    await as({ ...owner, role: "user" }, async () => {
      const res = await request(app).delete(`/api/images/${image.id}`);
      assert.ok(
        [200, 500].includes(res.status),
        `the owner got ${res.status} deleting their own image`
      );

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
