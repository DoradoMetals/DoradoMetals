// Strict body parsing at the transport boundary (D214 item 3): an unknown key
// or a wrong-typed value is a 400 before the service runs. save_product also
// proves the ids-not-names redesign: `metal`/`supplier`/`mint` (the old
// name-resolution fields) are unknown keys now that the body carries ids.
import { test, afterAll } from "vitest";
import assert from "node:assert/strict";
import request from "supertest";
import { mockSessions, restoreSessions, as } from "#shared/testing/session.ts";

await mockSessions();
const { default: app } = await import("#app");

afterAll(() => restoreSessions());

const admin = { id: "11111111-1111-1111-1111-111111111111", role: "admin", name: "Admin", email: "admin@x.test" };
const asAdmin = <T>(fn: () => Promise<T> | T) => as(admin, fn);

// products.bullion's id columns are validated by the generated row schema's
// own z.string().uuid() (RFC4122-strict), not the shared uuidLike regex -
// unlike the all-ones "well-formed but names nothing" id this suite uses
// everywhere else, it must be a real-shaped v4 uuid to pass that check.
const AN_ID = "12345678-1234-4234-8234-123456789abc";

const FULL_PRODUCT = {
  id: AN_ID,
  metal_id: AN_ID,
  supplier_id: AN_ID,
  mint_id: AN_ID,
  name: "X", description: "d", bid_premium: 1, ask_premium: 1, type: "Coin",
  display: true, content: 1, gross: 1, purity: 0.999, variant_group: "",
  shadow_offset: 0, stock: 0, slug: null, homepage_display: false,
  legal_tender: false, domestic_tender: false, sell_display: false,
  is_generic: false, variant_label: "", quantity: 0,
  image_front: "/f.png", image_back: "/b.png", filter_category: null,
};

test("POST /products/save_product refuses the old metal/supplier/mint name fields", async () => {
  await asAdmin(async () => {
    const res = await request(app)
      .post("/api/products/save_product")
      .send({ product: { ...FULL_PRODUCT, metal: "Silver" } });
    assert.equal(res.status, 400, JSON.stringify(res.body));
    assert.match(res.body?.error?.message ?? "", /metal/);
  });
});

test("POST /products/save_product refuses a wrong type", async () => {
  await asAdmin(async () => {
    const res = await request(app)
      .post("/api/products/save_product")
      .send({ product: { ...FULL_PRODUCT, display: "true" } });
    assert.equal(res.status, 400, JSON.stringify(res.body));
  });
});

test("POST /products/create_product refuses an unknown key (created_by)", async () => {
  await asAdmin(async () => {
    const res = await request(app)
      .post("/api/products/create_product")
      .send({ name: "New Product", created_by: "someone" });
    assert.equal(res.status, 400, JSON.stringify(res.body));
    assert.match(res.body?.error?.message ?? "", /created_by/);
  });
});

test("POST /products/create_product refuses a wrong type", async () => {
  await asAdmin(async () => {
    const res = await request(app).post("/api/products/create_product").send({ name: 12345 });
    assert.equal(res.status, 400, JSON.stringify(res.body));
  });
});
