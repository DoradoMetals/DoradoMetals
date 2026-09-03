// The product endpoints, over real HTTP — checks the RENAME adapter doesn't leak new names to a frontend expecting the old ones. Five routes are public, deliberately (audited when the cart hole was found: they name a product, never a person).
// No advisory lock: nothing else in the suite writes products.bullion or exchange.products outside its own rolled-back transaction.
import { test, afterAll, beforeAll } from "vitest";
import assert from "node:assert/strict";
import request from "supertest";
import pool from "#db";
import { mockSessions, restoreSessions, as, anonymous } from "#shared/testing/session.ts";
import { TEST_ACTOR, TEST_CUSTOMER } from "#shared/testing/actor.ts";
import { inPinnedTransaction, assertNothingEscaped, outside } from "#shared/testing/pinned-pool.ts";

await mockSessions();
const { default: app } = await import("#app");

// SELECT projections, not table rows.
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

// The catalogue is genuinely public - a signed-out visitor browses it.
test("the catalogue answers a signed-out visitor in the schema's own shape", async () => {
  await inPinnedTransaction(async () => {
    await anonymous(async () => {
      const res = await request(app).get("/api/products/get_all_products");
      assert.equal(res.status, 200);
      assert.ok(Array.isArray(res.body) && res.body.length > 0);

      // Products is CONVERTED: the frontend reads `name` now, and the legacy spelling reaching it would render blank cards — the e2e catalogue spec's price-count floor is the browser-level canary for that.
      const p = res.body[0];
      assert.ok("name" in p, "the legacy spelling came back - the frontend reads name now");
      assert.ok(!("product_name" in p), "both spellings came back at once");
      assert.ok(p.name, "a product came back with no name");
    });
  }, { actor: TEST_ACTOR.id });
});

test("a slug names a product, not a person", async () => {
  await inPinnedTransaction(async () => {
    const [{ slug }] = await outside(
      `SELECT slug FROM products.bullion WHERE slug IS NOT NULL ORDER BY id ASC LIMIT 1`
    );
    await anonymous(async () => {
      const res = await request(app).get("/api/products/get_product_from_slug").query({ slug });
      assert.equal(res.status, 200);
      const rows = Array.isArray(res.body) ? res.body : [res.body];
      assert.ok(rows.length > 0 && rows[0], "a real slug returned nothing");
      assert.ok("name" in rows[0]);
    });
  }, { actor: TEST_ACTOR.id });
});

test("the admin catalogue and the admin writes are refused to a customer", async () => {
  await inPinnedTransaction(async () => {
    await as(customer, async () => {
      const calls = [
        ["get", "/api/products/get_admin_products", {}],
        ["get", "/api/products/get_metals", {}],
        ["get", "/api/products/get_mints", {}],
        ["get", "/api/products/get_product_types", {}],
        ["post", "/api/products/save_product", { product: {}, user: {} }],
        ["post", "/api/products/create_product", { name: "replay", created_by: "x" }],
      ];
      // Declared as a tuple list — inferred, the array's element type collapses to a union, and `request(app)[verb]` then indexes SuperTest with something that isn't one of its methods.
      for (const [verb, path, body] of calls as Array<
        ["get" | "post", string, Record<string, unknown>]
      >) {
        const res = await request(app)[verb](path).send(body);
        assert.equal(res.status, 403, `${path} answered ${res.status} to a customer`);
      }
    });
  }, { actor: TEST_ACTOR.id });
});

// The write path: creating is the only product write that makes a row (done inside the pinned transaction). No adapter — the body arrives in the schema's own names and comes back the same way.
test("creating a product round-trips in the schema's own names", async () => {
  await inPinnedTransaction(async () => {
    await as(admin, async () => {
      const name = `replay-product-${Date.now()}`;
      // created_by is not a field of this body: public.audit_stamp writes it
      // from the connection's actor.
      const res = await request(app)
        .post("/api/products/create_product")
        .send({ name });

      // 201, not 200 — checked against the route rather than assumed, after asserting the wrong one here first.
      assert.equal(res.status, 201, JSON.stringify(res.body));
      const made = Array.isArray(res.body) ? res.body[0] : res.body;
      assert.ok(made?.id, "no id came back");
      assert.equal(
        made.name,
        name,
        "the created product came back under the wrong spelling, or nameless"
      );
      assert.ok(!("product_name" in made), "the legacy spelling came back after the conversion");

      // created_by comes from the request body, not the session — admin-only, and the frontend sends the real user. Noted because it's the same "trust the request" shape as five real bugs.
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
