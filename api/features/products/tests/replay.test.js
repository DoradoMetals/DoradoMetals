// The product endpoints, over real HTTP.
//
// Products are the one feature with a RENAME adapter rather than a reshaping
// one, and that difference is the point of testing it: a rename passes
// unmatched keys through, so it cannot produce the nulls that returned a
// nameless address from features/addresses. What it CAN do is leak the new
// names to a frontend expecting the old ones, which is what these check.
//
// Five of the routes are public, deliberately, and were audited against the
// controllers when the cart hole was found - they name a product, never a
// person. The admin writes are asserted by refusal rather than by exercise
// where they would create rows.
//
// No advisory lock: nothing else in the suite writes products.bullion or
// exchange.products outside its own rolled-back transaction.
import test, { after, before } from "node:test";
import assert from "node:assert/strict";
import request from "supertest";
import pool from "#db";
import { mockSessions, restoreSessions, as, anonymous } from "#shared/testing/session.ts";
import { inPinnedTransaction, assertNothingEscaped, outside } from "#shared/testing/pinned-pool.ts";

await mockSessions();
const { default: app } = await import("#app");

let admin;
let customer;

before(async () => {
  const admins = await outside(
    `SELECT id, name, email FROM exchange.users WHERE role = 'admin' LIMIT 1`
  );
  admin = { ...admins[0], role: "admin" };
  assert.ok(admin.id, "dev has no admin");

  const users = await outside(
    `SELECT id, name, email FROM exchange.users WHERE role IS DISTINCT FROM 'admin' LIMIT 1`
  );
  customer = { ...users[0], role: "user" };
  assert.ok(customer.id, "dev has no non-admin user");
});

after(async () => {
  restoreSessions();
  await pool.end();
});

// The catalogue is genuinely public - a signed-out visitor browses it.
test("the catalogue answers a signed-out visitor in the legacy shape", async () => {
  await inPinnedTransaction(async () => {
    await anonymous(async () => {
      const res = await request(app).get("/api/products/get_all_products");
      assert.equal(res.status, 200);
      assert.ok(Array.isArray(res.body) && res.body.length > 0);

      // PRODUCTS_WIRE=legacy, so the adapter has renamed the new columns back.
      // The frontend reads product_name; `name` reaching it would render blank.
      const p = res.body[0];
      assert.ok("product_name" in p, "the new name leaked to the frontend");
      assert.ok(!("name" in p), "both spellings came back at once");
      assert.ok(p.product_name, "a product came back with no name");
    });
  });
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
      assert.ok("product_name" in rows[0]);
    });
  });
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
      for (const [verb, path, body] of calls) {
        const res = await request(app)[verb](path).send(body);
        assert.equal(res.status, 403, `${path} answered ${res.status} to a customer`);
      }
    });
  });
});

// The write path, through the adapter both ways. Creating is the only product
// write that makes a row, and it is done inside the pinned transaction.
test("creating a product round-trips through the rename adapter", async () => {
  await inPinnedTransaction(async () => {
    await as(admin, async () => {
      const name = `replay-product-${Date.now()}`;
      const res = await request(app)
        .post("/api/products/create_product")
        .send({ name, created_by: admin.name });

      // 201, not 200: this route creates. Checked against the route rather
      // than assumed, after asserting the wrong one here first.
      assert.equal(res.status, 201, JSON.stringify(res.body));
      const made = Array.isArray(res.body) ? res.body[0] : res.body;
      assert.ok(made?.id, "no id came back");
      assert.equal(
        made.product_name,
        name,
        "the created product came back under the wrong spelling, or nameless"
      );
      assert.ok(!("name" in made), "the new spelling reached the frontend alongside the old");

      // created_by comes from the request body rather than the session. That is
      // admin-only and the frontend sends the real user, so it is audit
      // attribution an admin could mis-set rather than a hole - noted here
      // because it is the same "trust the request" shape as five real bugs, and
      // somebody should decide it deliberately rather than find it again.
      assert.equal(made.created_by, admin.name);
    });
  });
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
