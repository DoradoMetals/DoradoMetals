// Strict body parsing at the transport boundary (D214 item 3): an unknown key
// or a wrong-typed value is a 400 before the service runs, on every
// body-accepting addresses endpoint. is_valid/is_residential are a deliberate
// case - server-controlled facts that used to be accepted in the body and
// are now refused by name.
import test, { after } from "node:test";
import assert from "node:assert/strict";
import request from "supertest";
import { mockSessions, restoreSessions, as } from "#shared/testing/session.ts";

await mockSessions();
const { default: app } = await import("#app");

after(() => restoreSessions());

const user = { id: "11111111-1111-1111-1111-111111111111", role: "user", name: "U", email: "u@x.test" };
const asUser = <T>(fn: () => Promise<T> | T) => as(user, fn);

const ADDRESS = { line_1: "1 St", city: "Dallas", state: "TX", zip: "75201", country: "US" };

test("POST /addresses/create refuses the server-controlled is_valid/is_residential", async () => {
  await asUser(async () => {
    const res = await request(app)
      .post("/api/addresses/create")
      .send({ address: { ...ADDRESS, is_valid: true, is_residential: false } });
    assert.equal(res.status, 400, JSON.stringify(res.body));
    assert.match(res.body?.error?.message ?? "", /is_valid|is_residential/);
  });
});

test("POST /addresses/create refuses a wrong type", async () => {
  await asUser(async () => {
    const res = await request(app)
      .post("/api/addresses/create")
      .send({ address: { ...ADDRESS, line_1: 12345 } });
    assert.equal(res.status, 400, JSON.stringify(res.body));
  });
});

test("POST /addresses/update refuses an unknown key", async () => {
  await asUser(async () => {
    const res = await request(app)
      .post("/api/addresses/update")
      .send({ address: { id: "11111111-1111-1111-1111-111111111111", ...ADDRESS, name: "Someone" } });
    assert.equal(res.status, 400, JSON.stringify(res.body));
  });
});

test("DELETE /addresses/delete refuses the retired composed {address} body", async () => {
  await asUser(async () => {
    const res = await request(app)
      .delete("/api/addresses/delete")
      .send({ address: { id: "11111111-1111-1111-1111-111111111111" } });
    assert.equal(res.status, 400, JSON.stringify(res.body));
  });
});

test("DELETE /addresses/delete refuses a wrong type", async () => {
  await asUser(async () => {
    const res = await request(app).delete("/api/addresses/delete").send({ address_id: 12345 });
    assert.equal(res.status, 400, JSON.stringify(res.body));
  });
});

test("POST /addresses/set_default refuses an unknown key", async () => {
  await asUser(async () => {
    const res = await request(app)
      .post("/api/addresses/set_default")
      .send({ address_id: "11111111-1111-1111-1111-111111111111", make_default: true });
    assert.equal(res.status, 400, JSON.stringify(res.body));
  });
});
