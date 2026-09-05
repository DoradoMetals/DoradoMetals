import { test, afterAll } from "vitest";
import assert from "node:assert/strict";
import request from "supertest";
import { mockSessions, restoreSessions, as } from "#shared/testing/session.ts";

await mockSessions();
const { default: app } = await import("#app");

afterAll(() => restoreSessions());

const admin = { id: "11111111-1111-1111-1111-111111111111", role: "admin", name: "Admin", email: "admin@x.test" };
const asAdmin = <T>(fn: () => Promise<T> | T) => as(admin, fn);

const AN_ID = "12345678-1234-4234-8234-123456789abc";

const FULL_PRODUCT = {
  id: AN_ID,
  metal_id: AN_ID,
  supplier_id: AN_ID,
  mint_id: AN_ID,
  name: "X", description: "d", bid_premium: 1, ask_premium: 1, type: "Coin",
  display: true, content: 1, gross: 1, purity: 0.999, variant_group: "",
  shadow_offset: 0, slug: null, homepage_display: false,
  legal_tender: false, domestic_tender: false,
  is_generic: false, variant_label: "",
  image_front: "/f.png", image_back: "/b.png", filter_category: null,
};

test("PATCH /products/:id refuses the old metal/supplier/mint name fields", async () => {
  await asAdmin(async () => {
    const res = await request(app)
      .patch(`/api/products/${AN_ID}`)
      .send({ ...FULL_PRODUCT, id: undefined, metal: "Silver" });
    assert.equal(res.status, 400, JSON.stringify(res.body));
    assert.match(res.body?.error?.message ?? "", /metal/);
  });
});

test("PATCH /products/:id refuses an id in the body", async () => {
  await asAdmin(async () => {
    const res = await request(app).patch(`/api/products/${AN_ID}`).send({ id: AN_ID });
    assert.equal(res.status, 400, JSON.stringify(res.body));
    assert.match(res.body?.error?.message ?? "", /id/);
  });
});

test("PATCH /products/:id refuses a wrong type", async () => {
  await asAdmin(async () => {
    const res = await request(app)
      .patch(`/api/products/${AN_ID}`)
      .send({ display: "true" });
    assert.equal(res.status, 400, JSON.stringify(res.body));
  });
});

test("PATCH /products/:id refuses a malformed id in the path", async () => {
  await asAdmin(async () => {
    const res = await request(app).patch("/api/products/not-a-uuid").send({ name: "X" });
    assert.equal(res.status, 400, JSON.stringify(res.body));
  });
});

const DECIDED = {
  name: "New Product",
  metal_id: "00000000-0000-4000-8000-000000000001",
  mint_id: "00000000-0000-4000-8000-000000000002",
  supplier_id: "00000000-0000-4000-8000-000000000003",
};

test("POST /products refuses an unknown key (created_by)", async () => {
  await asAdmin(async () => {
    const res = await request(app)
      .post("/api/products")
      .send({ ...DECIDED, created_by: "someone" });
    assert.equal(res.status, 400, JSON.stringify(res.body));
    assert.match(res.body?.error?.message ?? "", /created_by/);
  });
});

test("POST /products refuses a create that decides no metal, mint or supplier", async () => {
  for (const missing of ["metal_id", "mint_id", "supplier_id"] as const) {
    await asAdmin(async () => {
      const body: Record<string, unknown> = { ...DECIDED };
      delete body[missing];
      const res = await request(app).post("/api/products").send(body);
      assert.equal(res.status, 400, JSON.stringify(res.body));
      assert.match(res.body?.error?.message ?? "", new RegExp(missing));
    });
  }
});

test("POST /products refuses a wrong type", async () => {
  await asAdmin(async () => {
    const res = await request(app).post("/api/products").send({ name: 12345 });
    assert.equal(res.status, 400, JSON.stringify(res.body));
  });
});

test("GET /products refuses an undeclared filter", async () => {
  const res = await request(app).get("/api/products").query({ nonsense: "x" });
  assert.equal(res.status, 400, JSON.stringify(res.body));
});

test("GET /products refuses a sort it does not offer", async () => {
  const res = await request(app).get("/api/products").query({ sort: "price" });
  assert.equal(res.status, 400, JSON.stringify(res.body));
});
