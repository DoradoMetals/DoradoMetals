// The recaptcha verification endpoint, over real HTTP.
//
// One route, deliberately unguarded - it runs BEFORE anyone has a session, so
// requiring one would defeat it. That makes the missing-token path the only
// thing worth asserting here, and it is worth asserting precisely because this
// endpoint sits in front of the forms that create leads and accounts.
//
// WHAT IS NOT TESTED, AND WHY. A real token is verified against Google. This
// suite does not call Google: it is somebody else's service, it rate-limits,
// and a test that depends on it fails for reasons that have nothing to do with
// this codebase. The token path belongs in the sandbox integration suite.
//
// The consequence is worth stating plainly rather than leaving implied: NOTHING
// HERE PROVES A BAD TOKEN IS REJECTED. What is proved is that a request with no
// token is refused before the provider is reached at all, which is the case
// that would otherwise let a caller skip the check by simply omitting it.
import test, { after } from "node:test";
import assert from "node:assert/strict";
import request from "supertest";
import pool from "#db";
import { mockSessions, restoreSessions, anonymous } from "#shared/testing/session.ts";
import { inPinnedTransaction } from "#shared/testing/pinned-pool.ts";

await mockSessions();
const { default: app } = await import("#app");

after(async () => {
  restoreSessions();
  await pool.end();
});

// THE ASSERTION THIS FILE EXISTS FOR. Omitting the token must be a 400, not a
// pass. A guard that treats "absent" as "fine" is not a guard.
test("a request with no token is refused, not waved through", async () => {
  await inPinnedTransaction(async () => {
    await anonymous(async () => {
      for (const [name, payload] of [
        ["no body", {}],
        ["null token", { token: null }],
        ["empty token", { token: "" }],
      ]) {
        const res = await request(app).post("/api/recaptcha/verify-recaptcha").send(payload);
        assert.equal(res.status, 400, `"${name}" answered ${res.status} instead of 400`);
        assert.notEqual(
          res.body,
          true,
          `"${name}" was verified as human without presenting a token`
        );
      }
    });
  });
});

// It must stay reachable without a session. This runs in front of the signup
// and contact forms, so putting a guard on it would break the thing it protects.
test("the endpoint is reachable without a session", async () => {
  await inPinnedTransaction(async () => {
    await anonymous(async () => {
      const res = await request(app).post("/api/recaptcha/verify-recaptcha").send({});
      assert.notEqual(res.status, 401, "verify-recaptcha now requires a session it runs ahead of");
      assert.notEqual(res.status, 403, "verify-recaptcha now requires a role it runs ahead of");
    });
  });
});
