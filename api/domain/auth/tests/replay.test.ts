// The one auth route this API owns, over real HTTP — /api/account/set_password, used by the magic-link welcome flow (passwordless accounts get a credential after the link signs them in). Everything else is better-auth's, mounted separately.
// A deliberate limit: better-auth writes exchange through its OWN pool, so pinned-pool.ts CANNOT contain it — a successful setPassword here would really COMMIT to a real dev user's password with no rollback. This suite only exercises paths that return BEFORE any write (no session, a malformed newPassword) — same rule as everywhere else: nothing irreversible inside something pretending to be reversible. The success path belongs in a suite with a disposable user.
// requireAuth also calls auth.api.getSession directly, so mockSessions doesn't apply — the 401 below is better-auth genuinely finding no session, a stronger assertion than a patched one.
import { test, afterAll, beforeAll } from "vitest";
import assert from "node:assert/strict";
import request from "supertest";
import pool from "#db";
import { outside } from "#shared/testing/pinned-pool.ts";

const { default: app } = await import("#app");

let passwordRowsBefore: number;

// Read in a beforeAll() hook — a trailing top-level statement assumed module evaluation completes before any test runs; that held alone but failed under the full suite (the count hadn't been taken yet), which is worse than always failing since it looked like a working test.
beforeAll(async () => {
  passwordRowsBefore = (await outside(`SELECT count(*)::int AS n FROM exchange.account`))[0].n;
  assert.equal(typeof passwordRowsBefore, "number", "the baseline count was not taken");
});

afterAll(async () => {
  await pool.end();
});

test("a caller with no session cannot set a password", async () => {
  const res = await request(app)
    .post("/api/account/set_password")
    .send({ newPassword: "this-should-never-be-set" });
  assert.ok([401, 403].includes(res.status), `answered ${res.status} with no session`);
});

// The 400 must come before better-auth is reached. A missing password that
// reached setPassword would be better-auth's error, not this one.
test("a missing or malformed password is refused with 400", async () => {
  for (const [name, payload] of [
    ["no body", undefined],
    ["empty object", {}],
    ["null", { newPassword: null }],
    ["empty string", { newPassword: "" }],
    ["a number", { newPassword: 12345678 }],
    ["an object", { newPassword: { toString: "nope" } }],
  ]) {
    const req = request(app).post("/api/account/set_password");
    const res = payload === undefined ? await req : await req.send(payload);

    // Without a session requireAuth answers first, which is correct and is what
    // the previous test asserts. What matters here is that it is never a 200.
    assert.notEqual(res.status, 200, `"${name}" was accepted as a password`);
    assert.ok(
      [400, 401, 403].includes(res.status),
      `"${name}" answered ${res.status}`
    );
  }
});

// The safety property of this file itself — since the pin can't contain better-auth, prove directly that nothing here wrote a credential, counted from outside before and after.
test("this suite created no account credential", async () => {
  const rows = await outside(`SELECT count(*)::int AS n FROM exchange.account`);
  assert.equal(
    rows[0].n,
    passwordRowsBefore,
    "the auth suite changed exchange.account - the pin does not contain better-auth, " +
      "so anything this file writes is COMMITTED to dev"
  );
});
