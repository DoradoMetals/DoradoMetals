// Strict body parsing at the transport boundary (D214 item 3): an unknown key
// or a wrong-typed value is a 400 before the service runs, on every
// body-accepting addresses endpoint. is_valid/is_residential are a deliberate
// case - server-controlled facts that used to be accepted in the body and
// are now refused by name, and so is `id`: the address is named once, in the
// path (ruling 43).
import { test, afterAll } from "vitest";
import assert from "node:assert/strict";
import request from "supertest";
import { mockSessions, restoreSessions, as } from "#shared/testing/session.ts";

await mockSessions();
const { default: app } = await import("#app");

afterAll(() => restoreSessions());

const user = { id: "11111111-1111-1111-1111-111111111111", role: "user", name: "U", email: "u@x.test" };
const asUser = <T>(fn: () => Promise<T> | T) => as(user, fn);
const ID = "11111111-1111-1111-1111-111111111111";

const ADDRESS = { line_1: "1 St", city: "Dallas", state: "TX", zip: "75201", country: "US" };

test("POST /addresses refuses the server-controlled is_valid/is_residential", async () => {
  await asUser(async () => {
    const res = await request(app)
      .post("/api/addresses")
      .send({ address: { ...ADDRESS, is_valid: true, is_residential: false } });
    assert.equal(res.status, 400, JSON.stringify(res.body));
    assert.match(res.body?.error?.message ?? "", /is_valid|is_residential/);
  });
});

test("POST /addresses refuses a wrong type", async () => {
  await asUser(async () => {
    const res = await request(app).post("/api/addresses").send({ address: { ...ADDRESS, line_1: 12345 } });
    assert.equal(res.status, 400, JSON.stringify(res.body));
  });
});

// The id used to ride INSIDE the patch, where it read as a column being
// written and had to be hand-checked. It is the path now, and the body refuses
// it by name.
test("PATCH /addresses/:id refuses an id in the body", async () => {
  await asUser(async () => {
    const res = await request(app).patch(`/api/addresses/${ID}`).send({ address: { id: ID, ...ADDRESS } });
    assert.equal(res.status, 400, JSON.stringify(res.body));
  });
});

test("PATCH /addresses/:id refuses an unknown key", async () => {
  await asUser(async () => {
    const res = await request(app)
      .patch(`/api/addresses/${ID}`)
      .send({ address: ADDRESS, user_address: { name: "Someone" } });
    assert.equal(res.status, 400, JSON.stringify(res.body));
  });
});

test("PATCH /addresses/:id refuses a wrong-typed recipient", async () => {
  await asUser(async () => {
    const res = await request(app)
      .patch(`/api/addresses/${ID}`)
      .send({ user_address: { recipient_name: 12345 } });
    assert.equal(res.status, 400, JSON.stringify(res.body));
  });
});

// Google bills per request, so a query too short to be a search is refused
// here rather than there.
test("GET /addresses/suggestions refuses a query with nothing in it", async () => {
  await asUser(async () => {
    const res = await request(app).get("/api/addresses/suggestions").query({ q: "ab" });
    assert.equal(res.status, 422, JSON.stringify(res.body));
  });
});

test("GET /addresses/suggestions refuses a missing query", async () => {
  await asUser(async () => {
    const res = await request(app).get("/api/addresses/suggestions");
    assert.equal(res.status, 400, JSON.stringify(res.body));
  });
});
