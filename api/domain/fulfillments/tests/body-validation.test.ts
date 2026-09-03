// Strict body parsing at the transport boundary (D214 item 3): an unknown key
// or a wrong-typed value is a 400 before the service runs, on every
// body-accepting fulfillments endpoint (the parent's own five, plus
// methods/update, schedule_pickup and schedule_direct - each owned by a
// different sub-resource but reached through this feature's routes).
import { test, afterAll } from "vitest";
import assert from "node:assert/strict";
import request from "supertest";
import { mockSessions, restoreSessions, as } from "#shared/testing/session.ts";

await mockSessions();
const { default: app } = await import("#app");

afterAll(() => restoreSessions());

const admin = { id: "11111111-1111-1111-1111-111111111111", role: "admin", name: "Admin", email: "admin@x.test" };
const asAdmin = <T>(fn: () => Promise<T> | T) => as(admin, fn);
// fulfillments' generated row schemas validate ids with z.string().uuid()
// (RFC4122-strict) - the all-ones id fails that check before the field this
// test targets is ever reached, so a real-shaped v4 uuid is used instead.
const ID = "12345678-1234-4234-8234-123456789abc";

test("POST /fulfillments/methods/update refuses an unknown key", async () => {
  await asAdmin(async () => {
    const res = await request(app)
      .post("/api/fulfillments/methods/update")
      .send({ method: { id: ID, label: "New", category: "SHIPMENT" } });
    assert.equal(res.status, 400, JSON.stringify(res.body));
    assert.match(res.body?.error?.message ?? "", /category/);
  });
});

test("POST /fulfillments/methods/update refuses a wrong type", async () => {
  await asAdmin(async () => {
    const res = await request(app)
      .post("/api/fulfillments/methods/update")
      .send({ method: { id: ID, enabled: "yes" } });
    assert.equal(res.status, 400, JSON.stringify(res.body));
  });
});

test("POST /fulfillments/cancel_schedule refuses an unknown key", async () => {
  await asAdmin(async () => {
    const res = await request(app)
      .post("/api/fulfillments/cancel_schedule")
      .send({ fulfillment_id: ID, reason: "customer changed their mind" });
    assert.equal(res.status, 400, JSON.stringify(res.body));
  });
});

test("POST /fulfillments/cancel_schedule refuses a wrong type", async () => {
  await asAdmin(async () => {
    const res = await request(app)
      .post("/api/fulfillments/cancel_schedule")
      .send({ fulfillment_id: 12345 });
    assert.equal(res.status, 400, JSON.stringify(res.body));
  });
});

test("POST /fulfillments/set_method refuses an unknown key", async () => {
  await asAdmin(async () => {
    const res = await request(app)
      .post("/api/fulfillments/set_method")
      .send({ fulfillment_id: ID, method_id: ID, updated_by_id: ID });
    assert.equal(res.status, 400, JSON.stringify(res.body));
  });
});

test("POST /fulfillments/set_status refuses a wrong type", async () => {
  await asAdmin(async () => {
    const res = await request(app)
      .post("/api/fulfillments/set_status")
      .send({ fulfillment_id: ID, status: 123 });
    assert.equal(res.status, 400, JSON.stringify(res.body));
  });
});

test("POST /fulfillments/schedule_pickup refuses an unknown key", async () => {
  await asAdmin(async () => {
    const res = await request(app)
      .post("/api/fulfillments/schedule_pickup")
      .send({ pickup: { fulfillment_id: ID, pickup_address_id: ID, notes: "leave at door" } });
    assert.equal(res.status, 400, JSON.stringify(res.body));
    assert.match(res.body?.error?.message ?? "", /notes/);
  });
});

test("POST /fulfillments/schedule_pickup refuses a wrong type", async () => {
  await asAdmin(async () => {
    const res = await request(app)
      .post("/api/fulfillments/schedule_pickup")
      .send({ pickup: { fulfillment_id: ID, pickup_address_id: 12345 } });
    assert.equal(res.status, 400, JSON.stringify(res.body));
  });
});

test("POST /fulfillments/schedule_direct refuses an unknown key", async () => {
  await asAdmin(async () => {
    const res = await request(app)
      .post("/api/fulfillments/schedule_direct")
      .send({ direct: { fulfillment_id: ID, location_id: ID, walk_in: true } });
    assert.equal(res.status, 400, JSON.stringify(res.body));
    assert.match(res.body?.error?.message ?? "", /walk_in/);
  });
});

test("POST /fulfillments/schedule_direct refuses a wrong type", async () => {
  await asAdmin(async () => {
    const res = await request(app)
      .post("/api/fulfillments/schedule_direct")
      .send({ direct: { fulfillment_id: ID, location_id: ID, is_appointment: "yes" } });
    assert.equal(res.status, 400, JSON.stringify(res.body));
  });
});
