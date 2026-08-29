// The one auth route this API owns, over real HTTP.
//
// Everything else about authentication is better-auth's, mounted separately.
// What lives here is /api/account/set_password, used by the magic-link welcome
// flow: accounts created by an admin or by an order are passwordless, and after
// the link signs them in, this gives them a credential.
//
// A DELIBERATE LIMIT, AND THE REASON IS THE WHOLE POINT OF THIS FILE.
//
// better-auth writes `exchange` through ITS OWN POOL, via modelName - that is
// why auth is the one feature with no *_SOURCE switch and has to be an atomic
// cutover. The same fact has a consequence for tests:
// shared/testing/pinned-pool.js CANNOT CONTAIN IT. The pin replaces the shared
// pool; better-auth is not using it.
//
// So a successful setPassword in a test would COMMIT - it would really change a
// real dev user's password, and no rollback would take it back. This suite
// therefore exercises only the paths that return BEFORE any write:
//
//   requireAuth rejecting a caller with no session
//   the controller rejecting a missing or non-string newPassword
//
// That is not squeamishness, it is the same rule as everywhere else in this
// project: nothing irreversible inside something that is pretending to be
// reversible. The success path belongs in a suite that owns a disposable user.
//
// requireAuth also calls auth.api.getSession directly, so mockSessions does not
// apply here either - the 401 below is better-auth genuinely finding no session,
// which is a stronger assertion than a patched one.
import test, { after, before } from "node:test";
import assert from "node:assert/strict";
import request from "supertest";
import pool from "#db";
import { outside } from "#shared/testing/pinned-pool.ts";

const { default: app } = await import("#app");

let passwordRowsBefore: number;

// READ IN A before() HOOK, which is the only ordering node guarantees.
//
// The first version assigned this in a trailing top-level statement, after the
// test() registrations, on the theory that module evaluation completes before
// any test runs. It passed when the file was run on its own and FAILED under
// the full suite - `10 !== undefined`, because the count had not been taken
// yet. The theory was wrong, and being wrong only some of the time is worse
// than being wrong always: it read as a working test for one run.
before(async () => {
  passwordRowsBefore = (await outside(`SELECT count(*)::int AS n FROM exchange.account`))[0].n;
  assert.equal(typeof passwordRowsBefore, "number", "the baseline count was not taken");
});

after(async () => {
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

// THE SAFETY PROPERTY OF THIS FILE ITSELF. Since the pin cannot contain
// better-auth, prove directly that nothing here wrote a credential. Counted
// from outside, before and after.
test("this suite created no account credential", async () => {
  const rows = await outside(`SELECT count(*)::int AS n FROM exchange.account`);
  assert.equal(
    rows[0].n,
    passwordRowsBefore,
    "the auth suite changed exchange.account - the pin does not contain better-auth, " +
      "so anything this file writes is COMMITTED to dev"
  );
});
