// Strict body parsing at the transport boundary (D214 item 3): an unknown key
// or a wrong-typed value is a 400 before the service runs, on every
// body-accepting reviews endpoint. No database write happens on a refused
// body, so these need no transaction.
import { test, afterAll } from "vitest";
import assert from "node:assert/strict";
import request from "supertest";
import { mockSessions, restoreSessions, as } from "#shared/testing/session.ts";

await mockSessions();
const { default: app } = await import("#app");

afterAll(() => restoreSessions());

const admin = { id: "11111111-1111-1111-1111-111111111111", role: "admin", name: "Admin", email: "admin@x.test" };
const asAdmin = <T>(fn: () => Promise<T> | T) => as(admin, fn);

test("POST /reviews refuses an unknown key (created_by)", async () => {
  await asAdmin(async () => {
    const res = await request(app)
      .post("/api/reviews")
      .send({ name: "A", review_text: "t", rating: 5, hidden: false, created_by: "someone" });
    assert.equal(res.status, 400, JSON.stringify(res.body));
    assert.match(res.body?.error?.message ?? "", /created_by/);
  });
});

test("POST /reviews refuses a wrong type", async () => {
  await asAdmin(async () => {
    const res = await request(app)
      .post("/api/reviews")
      .send({ name: "A", review_text: "t", rating: "five", hidden: false });
    assert.equal(res.status, 400, JSON.stringify(res.body));
  });
});

test("PATCH /reviews/:id refuses an unknown key in the patch", async () => {
  await asAdmin(async () => {
    const res = await request(app)
      .patch("/api/reviews/11111111-1111-1111-1111-111111111111")
      .send({ user_name: "someone" });
    assert.equal(res.status, 400, JSON.stringify(res.body));
  });
});

test("PATCH /reviews/:id refuses a wrong type in the patch", async () => {
  await asAdmin(async () => {
    const res = await request(app)
      .patch("/api/reviews/11111111-1111-1111-1111-111111111111")
      .send({ hidden: "yes" });
    assert.equal(res.status, 400, JSON.stringify(res.body));
  });
});
