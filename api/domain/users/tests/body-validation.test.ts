// Strict body parsing at the transport boundary (D214 item 3): an unknown key
// or a wrong-typed value is a 400 before the service runs. `mode` is a
// deliberate case - the retired spelling `op` replaced (D214: no shape is
// preserved on this branch).
import { test, afterAll } from "vitest";
import assert from "node:assert/strict";
import request from "supertest";
import { mockSessions, restoreSessions, as } from "#shared/testing/session.ts";

await mockSessions();
const { default: app } = await import("#app");

afterAll(() => restoreSessions());

const admin = { id: "11111111-1111-1111-1111-111111111111", role: "admin", name: "Admin", email: "admin@x.test" };
const asAdmin = <T>(fn: () => Promise<T> | T) => as(admin, fn);

test("POST /users/update_credit refuses the retired `mode` field", async () => {
  await asAdmin(async () => {
    const res = await request(app)
      .post("/api/users/update_credit")
      .send({ user_id: "12345678-1234-4234-8234-123456789abc", op: "add", mode: "add", amount: 10 });
    assert.equal(res.status, 400, JSON.stringify(res.body));
    assert.match(res.body?.error?.message ?? "", /mode/);
  });
});

test("POST /users/update_credit refuses an op outside the enum", async () => {
  await asAdmin(async () => {
    const res = await request(app)
      .post("/api/users/update_credit")
      .send({ user_id: "12345678-1234-4234-8234-123456789abc", op: "multiply", amount: 10 });
    assert.equal(res.status, 400, JSON.stringify(res.body));
  });
});

test("POST /users/update_credit refuses a wrong type", async () => {
  await asAdmin(async () => {
    const res = await request(app)
      .post("/api/users/update_credit")
      .send({ user_id: "12345678-1234-4234-8234-123456789abc", op: "add", amount: "ten" });
    assert.equal(res.status, 400, JSON.stringify(res.body));
  });
});
