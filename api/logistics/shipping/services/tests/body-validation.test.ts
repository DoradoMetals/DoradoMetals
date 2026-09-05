import { test, afterAll } from "vitest";
import assert from "node:assert/strict";
import request from "supertest";
import { mockSessions, restoreSessions, as } from "#shared/testing/session.ts";

await mockSessions();
const { default: app } = await import("#app");

afterAll(() => restoreSessions());

const admin = { id: "11111111-1111-1111-1111-111111111111", role: "admin", name: "Admin", email: "admin@x.test" };
const asAdmin = <T>(fn: () => Promise<T> | T) => as(admin, fn);

test("POST /carrier_services/create refuses the underlying column name", async () => {
  await asAdmin(async () => {
    const res = await request(app)
      .post("/api/carrier_services/create")
      .send({ service: { name: "Ground", supports_pickups: true } });
    assert.equal(res.status, 400, JSON.stringify(res.body));
    assert.match(res.body?.error?.message ?? "", /supports_pickups/);
  });
});

test("POST /carrier_services/create refuses a wrong type", async () => {
  await asAdmin(async () => {
    const res = await request(app)
      .post("/api/carrier_services/create")
      .send({ service: { name: "Ground", supports_pickup: "yes" } });
    assert.equal(res.status, 400, JSON.stringify(res.body));
  });
});

test("POST /carrier_services/update refuses an unknown key (price)", async () => {
  await asAdmin(async () => {
    const res = await request(app)
      .post("/api/carrier_services/update")
      .send({ service: { id: "12345678-1234-4234-8234-123456789abc", name: "Ground", price: 12.5 } });
    assert.equal(res.status, 400, JSON.stringify(res.body));
    assert.match(res.body?.error?.message ?? "", /price/);
  });
});
