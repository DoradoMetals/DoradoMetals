import { test, afterAll, beforeAll } from "vitest";
import assert from "node:assert/strict";
import request from "supertest";
import pool from "#pool";
import { mockSessions, restoreSessions, as, anonymous } from "#shared/testing/session.ts";
import { TEST_ACTOR, TEST_CUSTOMER } from "#shared/testing/actor.ts";
import { inPinnedTransaction, assertNothingEscaped, outside } from "#shared/testing/pinned-pool.ts";

await mockSessions();
const { default: app } = await import("#app");

type UserFixture = { id: string; name: string | null; email: string | null };
type Caller = UserFixture & { role: string };

let admin: Caller;
let customer: Caller;

beforeAll(async () => {
  admin = { ...TEST_ACTOR, role: "admin" };

  customer = { ...TEST_CUSTOMER, role: "user" };
});

afterAll(async () => {
  restoreSessions();
  await pool.end();
});

test("the catalogue answers a signed-out visitor in the schema's own shape", async () => {
  await inPinnedTransaction(async () => {
    await anonymous(async () => {
      const res = await request(app).get("/api/products");
      assert.equal(res.status, 200);
      assert.ok(Array.isArray(res.body) && res.body.length > 0);

      const group = res.body[0];
      assert.ok("default" in group && Array.isArray(group.variants),
        "the catalogue answered rows, not groups");
      const p = group.default;
      assert.ok("name" in p, "the legacy spelling came back - the frontend reads name now");
      assert.ok(!("product_name" in p), "both spellings came back at once");
      assert.ok(p.name, "a product came back with no name");
    });
  }, { actor: TEST_ACTOR.id });
});

test("a slug names a product, not a person", async () => {
  await inPinnedTransaction(async () => {
    const [{ slug }] = await outside(
      `SELECT slug FROM products.bullion
        WHERE slug IS NOT NULL AND display = true ORDER BY id ASC LIMIT 1`
    );
    await anonymous(async () => {
      const res = await request(app).get(`/api/products/${slug}`);
      assert.equal(res.status, 200);
      assert.ok(res.body?.default, "a real slug returned nothing");
      assert.ok("name" in res.body.default);
    });
  }, { actor: TEST_ACTOR.id });
});

test("the admin catalogue and the admin writes are refused to a customer", async () => {
  await inPinnedTransaction(async () => {
    await as(customer, async () => {
      const calls = [
        ["get", "/api/products/admin", {}],
        ["get", "/api/metals", {}],
        ["get", "/api/mints", {}],
        ["get", "/api/products/types", {}],
        ["patch", "/api/products/12345678-1234-4234-8234-123456789abc", { name: "replay" }],
        ["post", "/api/products", { name: "replay", created_by: "x" }],
      ];
      for (const [verb, path, body] of calls as Array<
        ["get" | "post" | "patch", string, Record<string, unknown>]
      >) {
        const res = await request(app)[verb](path).send(body);
        assert.equal(res.status, 403, `${path} answered ${res.status} to a customer`);
      }
    });
  }, { actor: TEST_ACTOR.id });
});

test("creating a product round-trips in the schema's own names", async () => {
  await inPinnedTransaction(async () => {
    await as(admin, async () => {
      const name = `replay-product-${Date.now()}`;
      const res = await request(app).post("/api/products").send({ name });

      assert.equal(res.status, 201, JSON.stringify(res.body));
      const made = Array.isArray(res.body) ? res.body[0] : res.body;
      assert.ok(made?.id, "no id came back");
      assert.equal(
        made.name,
        name,
        "the created product came back under the wrong spelling, or nameless"
      );
      assert.ok(!("product_name" in made), "the legacy spelling came back after the conversion");

      assert.equal(made.created_by, admin.name);
    });
  }, { actor: TEST_ACTOR.id });
});

test("nothing this file created survived the transaction", async () => {
  assert.equal(
    await assertNothingEscaped("products.bullion", "name LIKE 'replay-product-%'"),
    0,
    "a replay product was committed to dev"
  );
  assert.equal(
    await assertNothingEscaped("exchange.products", "product_name LIKE 'replay-product-%'"),
    0,
    "a replay product escaped into exchange"
  );
});
