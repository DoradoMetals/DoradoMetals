// Strict body parsing at the transport boundary (D214 item 3): an unknown key
// or a wrong-typed value is a 400 before the service runs. `path` is a
// deliberate case - it used to be an accepted-and-silently-ignored field
// (the server always chooses the object key); now it is an unknown key.
import { test, afterAll } from "vitest";
import assert from "node:assert/strict";
import request from "supertest";
import { mockSessions, restoreSessions, as } from "#shared/testing/session.ts";

await mockSessions();
const { default: app } = await import("#app");

afterAll(() => restoreSessions());

const user = { id: "11111111-1111-1111-1111-111111111111", role: "user", name: "U", email: "u@x.test" };
const asUser = <T>(fn: () => Promise<T> | T) => as(user, fn);

test("POST /images/upload refuses the retired `path` field", async () => {
  await asUser(async () => {
    const res = await request(app)
      .post("/api/images/upload")
      .send({ filename: "a.png", mime_type: "image/png", size_bytes: 10, path: "anywhere/" });
    assert.equal(res.status, 400, JSON.stringify(res.body));
    assert.match(res.body?.error?.message ?? "", /path/);
  });
});

test("POST /images/upload refuses a wrong type", async () => {
  await asUser(async () => {
    const res = await request(app)
      .post("/api/images/upload")
      .send({ filename: "a.png", size_bytes: "ten" });
    assert.equal(res.status, 400, JSON.stringify(res.body));
  });
});

test("DELETE /images/delete refuses an unknown key", async () => {
  await asUser(async () => {
    const res = await request(app)
      .delete("/api/images/delete")
      .send({ id: "11111111-1111-1111-1111-111111111111", user_id: "someone-elses" });
    assert.equal(res.status, 400, JSON.stringify(res.body));
  });
});

test("DELETE /images/delete refuses a wrong type", async () => {
  await asUser(async () => {
    const res = await request(app).delete("/api/images/delete").send({ id: 12345 });
    assert.equal(res.status, 400, JSON.stringify(res.body));
  });
});
