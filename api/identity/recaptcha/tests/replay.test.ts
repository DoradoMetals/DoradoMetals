import { test, afterAll } from "vitest";
import assert from "node:assert/strict";
import request from "supertest";
import pool from "#pool";
import { mockSessions, restoreSessions, anonymous } from "#shared/testing/session.ts";
import { TEST_ACTOR } from "#shared/testing/actor.ts";
import { inPinnedTransaction } from "#shared/testing/pinned-pool.ts";

await mockSessions();
const { default: app } = await import("#app");

afterAll(async () => {
  restoreSessions();
  await pool.end();
});

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
  }, { actor: TEST_ACTOR.id });
});

test("the endpoint is reachable without a session", async () => {
  await inPinnedTransaction(async () => {
    await anonymous(async () => {
      const res = await request(app).post("/api/recaptcha/verify-recaptcha").send({});
      assert.notEqual(res.status, 401, "verify-recaptcha now requires a session it runs ahead of");
      assert.notEqual(res.status, 403, "verify-recaptcha now requires a role it runs ahead of");
    });
  }, { actor: TEST_ACTOR.id });
});
