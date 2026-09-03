// Strict body parsing at the transport boundary (D214 item 3): an unknown key
// or a wrong-typed value is a 400 before the service runs, on every
// body-accepting leads endpoint. No database write happens on a refused body,
// so these need no transaction.
import { test, afterAll } from "vitest";
import assert from "node:assert/strict";
import request from "supertest";
import { mockSessions, restoreSessions, as } from "#shared/testing/session.ts";

await mockSessions();
const { default: app } = await import("#app");

afterAll(() => restoreSessions());

const admin = { id: "11111111-1111-1111-1111-111111111111", role: "admin", name: "Admin", email: "admin@x.test" };
const asAdmin = <T>(fn: () => Promise<T> | T) => as(admin, fn);

test("POST /leads/create refuses an unknown key", async () => {
  await asAdmin(async () => {
    const res = await request(app)
      .post("/api/leads/create")
      .send({ lead: { name: "A", phone: null, email: null, created_by: "someone" } });
    assert.equal(res.status, 400, JSON.stringify(res.body));
    assert.match(res.body?.error?.message ?? "", /created_by/);
  });
});

test("POST /leads/create refuses a wrong type", async () => {
  await asAdmin(async () => {
    const res = await request(app)
      .post("/api/leads/create")
      .send({ lead: { name: 12345, phone: null, email: null } });
    assert.equal(res.status, 400, JSON.stringify(res.body));
  });
});

test("POST /leads/update refuses an unknown key in the patch", async () => {
  await asAdmin(async () => {
    const res = await request(app)
      .post("/api/leads/update")
      .send({ lead_id: "11111111-1111-1111-1111-111111111111", patch: { user_name: "someone" } });
    assert.equal(res.status, 400, JSON.stringify(res.body));
    assert.match(res.body?.error?.message ?? "", /user_name/);
  });
});

test("POST /leads/update refuses a wrong type in the patch", async () => {
  await asAdmin(async () => {
    const res = await request(app)
      .post("/api/leads/update")
      .send({ lead_id: "11111111-1111-1111-1111-111111111111", patch: { converted: "yes" } });
    assert.equal(res.status, 400, JSON.stringify(res.body));
  });
});
