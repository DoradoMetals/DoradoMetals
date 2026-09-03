// Products through the service, against real Postgres.
//
// Products carry bid_premium and ask_premium, which feed every price quoted -
// calculateItemPrice is content * (bid_spot * premium) - so a divergence here
// misprices orders rather than merely displaying something odd. Most of these
// are about the three-table composition producing exactly what the three joins
// produced.
//
// Each test runs inside a transaction that is rolled back.
import test, { after, before } from "node:test";
import assert from "node:assert/strict";
import type { PoolClient } from "pg";
import { randomUUID } from "node:crypto";
import pool from "#db";
import * as service from "#domain/products/service.ts";

let client: PoolClient;

before(async () => {
  assert.equal(
    new Date().getTimezoneOffset(), 0,
    "these tests require TZ=UTC - run them with `pnpm --filter @dorado/api test`"
  );
  client = await pool.connect();
});

after(async () => {
  client.release();
  await pool.end();
});

async function inRollback(fn: (c: PoolClient) => Promise<void>) {
  await client.query("BEGIN");
  try {
    await fn(client);
  } finally {
    await client.query("ROLLBACK");
  }
}

// The three labels the joins used to attach. A product missing any of them was
// dropped by the inner joins and is dropped by compose.ts.
test("the storefront carries the metal and mint names, and no ids", async () => {
  const rows = await service.getAllProducts();
  assert.ok(rows.length > 0, "dev has no displayed products");
  for (const row of rows) {
    assert.equal(typeof row.metal_type, "string", `${row.name} has no metal_type`);
    assert.equal(typeof row.mint_name, "string", `${row.name} has no mint_name`);
    assert.ok(!("metal_id" in row), "metal_id reached the wire");
    assert.ok(!("mint_id" in row), "mint_id reached the wire");
    assert.ok(!("supplier_id" in row), "supplier_id reached the wire");
  }
});

// The disclosure boundary, asked of the real response rather than the statement.
test("the storefront returns no admin-only field", async () => {
  const [row] = await service.getAllProducts();
  for (const field of [
    "display", "stock", "created_by", "updated_by", "created_at", "updated_at",
    "homepage_display", "filter_category", "quantity", "supplier",
  ]) {
    assert.ok(!(field in row), `${field} is admin-only and reached the storefront`);
  }
});

test("the admin list carries all three names and no ids", async () => {
  const rows = await service.getAllAdminProducts();
  assert.ok(rows.length > 0, "dev has no products");
  for (const row of rows) {
    assert.equal(typeof row.metal, "string");
    assert.equal(typeof row.mint, "string");
    assert.equal(typeof row.supplier, "string");
    for (const id of ["metal_id", "mint_id", "supplier_id"]) {
      assert.ok(!(id in row), `${id} reached the admin response`);
    }
  }
});

// The composition has to agree with what the join would have returned, for
// every product, or a label is attached to the wrong one.
test("every label matches what a join would have produced", async () => {
  const composed = await service.getAllAdminProducts();
  const { rows: joined } = await client.query(
    `SELECT p.id, metal.name AS metal, mint.name AS mint, supplier.name AS supplier
       FROM products.bullion p
       JOIN metals.metals metal ON metal.id = p.metal_id
       JOIN products.mints mint ON mint.id = p.mint_id
       JOIN refiners.exchange_compat supplier ON supplier.id = p.supplier_id`
  );
  assert.equal(composed.length, joined.length, "compose kept a different number of products");

  const byId = new Map(joined.map((r) => [r.id, r]));
  for (const row of composed) {
    const expected = byId.get(row.id);
    assert.ok(expected, `${row.id} is not what the join returns`);
    assert.equal(row.metal, expected.metal, `${row.name}: wrong metal`);
    assert.equal(row.mint, expected.mint, `${row.name}: wrong mint`);
    assert.equal(row.supplier, expected.supplier, `${row.name}: wrong supplier`);
  }
});

// The lists differ only in their WHERE clause and each one is a different
// promise to a customer: `display` is what they may buy, `sell_display` what
// they may sell. Swapping them is invisible in a shape check.
test("each list filters on the flag it claims to", async () => {
  const [storefront, sell, homepage] = await Promise.all([
    service.getAllProducts(), service.getSellProducts(), service.getHomepageProducts(),
  ]);
  const flags = async (rows: Array<{ id: string }>) => {
    const { rows: got } = await client.query(
      `SELECT id, display, sell_display, homepage_display FROM products.bullion
        WHERE id = ANY($1::uuid[])`,
      [rows.map((r: { id: string }) => r.id)]
    );
    return got;
  };
  // Each list is checked non-empty first. All three of these loops passed
  // vacuously if a WHERE clause returned nothing - and "returns nothing" is the
  // exact failure a read pivot produces when it points at a table nothing has
  // written yet, which is the failure these tests exist to catch.
  const [sf, sl, hp] = [await flags(storefront), await flags(sell), await flags(homepage)];
  assert.ok(sf.length, "the storefront list is empty, so this test asserts nothing");
  assert.ok(sl.length, "the sell list is empty, so this test asserts nothing");
  assert.ok(hp.length, "the homepage list is empty, so this test asserts nothing");

  for (const row of sf) assert.equal(row.display, true);
  for (const row of sl) assert.equal(row.sell_display, true);
  for (const row of hp) {
    assert.equal(row.homepage_display, true);
    // A product pulled from the storefront must leave the homepage with it.
    assert.equal(row.display, true, "an undisplayed product is on the homepage");
  }
});

// A slug is a public URL and `display` is what makes a product public. Without
// the flag in the statement, an unpublished product is readable by anyone who
// knows its slug.
//
// The count is not asserted to be one. A SLUG NAMES A VARIANT SET, not a
// product: `gold-american-eagle` is four rows. An earlier version of this test
// asserted 1 and failed against real data, which is how that got written down.
test("an undisplayed product is not reachable by its slug", async () => {
  await inRollback(async (c: PoolClient) => {
    const { rows: [live] } = await c.query(
      "SELECT id, slug FROM products.bullion WHERE display = true AND slug IS NOT NULL LIMIT 1"
    );
    if (!live) return;

    const shown = await service.getProductFromSlug(live.slug);
    assert.ok(shown.length > 0, "a displayed product is not reachable by its own slug");
    for (const row of shown) assert.equal(row.slug, live.slug);

    await c.query("UPDATE products.bullion SET display = false WHERE slug = $1", [live.slug]);
    // Reads run on the pool, so the statement is checked directly rather than
    // through the service, which could not see this transaction.
    const { rows: after } = await c.query(
      "SELECT count(*)::int n FROM products.bullion WHERE display = true AND slug = $1",
      [live.slug]
    );
    assert.equal(after[0].n, 0, "the slug statement would still return it");
  });
});

// The variant set itself, which is why the slug read returns a list at all.
test("a slug with variants returns every one of them", async () => {
  const { rows } = await client.query(
    `SELECT slug, count(*)::int n FROM products.bullion
      WHERE slug IS NOT NULL AND display = true
      GROUP BY slug HAVING count(*) > 1 ORDER BY n DESC LIMIT 1`
  );
  if (!rows[0]) return; // dev has no product with variants

  const set = await service.getProductFromSlug(rows[0].slug);
  assert.equal(set.length, rows[0].n, "the product page would be missing a size");
  assert.equal(new Set(set.map((p) => p.variant_label)).size, set.length,
    "two variants share a label, so the page cannot tell them apart");
});

// getFilteredProducts takes a metal NAME and the column is an id.
test("filtering by metal name returns that metal's products and no others", async () => {
  const all = await service.getAllProducts();
  const metal = all[0].metal_type;
  const filtered = await service.getFilteredProducts({ metal_type: metal });
  assert.ok(filtered.length > 0, `no products came back for ${metal}`);
  for (const row of filtered) assert.equal(row.metal_type, metal);
  assert.equal(
    filtered.length, all.filter((p) => p.metal_type === metal).length,
    "the filter and the full list disagree about how many that metal has"
  );
});

// An unknown metal used to be an inner join matching nothing. It must stay an
// empty list rather than becoming "no filter" and returning the whole shop.
test("an unknown metal name returns nothing, not everything", async () => {
  assert.deepEqual(await service.getFilteredProducts({ metal_type: "Unobtainium" }), []);
});

test("no filters at all is the whole displayed list", async () => {
  assert.equal(
    (await service.getFilteredProducts({})).length,
    (await service.getAllProducts()).length
  );
});

// THE CART CANNOT SET A PRICE. Only the quantity survives from the request.
test("items from the server keep the server's premium and the client's quantity", async () => {
  const [product] = await service.getAllProducts();
  const items = await service.getItemsFromServer([{ id: product.id, quantity: 7 }]);
  assert.equal(items.length, 1);
  assert.equal(items[0].quantity, 7, "the client's quantity was lost");
  assert.equal(Number(items[0].bid_premium), Number(product.bid_premium),
    "the premium did not come from the server");
  assert.equal(Number(items[0].ask_premium), Number(product.ask_premium));
});

test("an id nobody sent gets quantity zero rather than being invented", async () => {
  const [product] = await service.getAllProducts();
  const items = await service.getItemsFromServer([{ id: product.id, quantity: 3 }]);
  assert.equal(items.length, 1, "an item appeared that the cart did not name");
});

// getLiveness answers per id AND per direction. Folding it into the storefront
// read would turn "you may not buy that" into "that does not exist".
test("liveness answers for both directions independently", async () => {
  const { rows } = await client.query(
    "SELECT id, display, sell_display FROM products.bullion LIMIT 5"
  );
  const live = await service.getLiveness(rows.map((r) => r.id));
  assert.equal(live.length, rows.length);
  const byId = new Map(live.map((r) => [r.id, r]));
  for (const row of rows) {
    // GUARDED. `Map.get` is `| undefined`, and a product missing from the
    // liveness read produced a TypeError rather than naming the id. The
    // length check above does not cover it: two lists of the same length can
    // hold different ids.
    const seen = byId.get(row.id);
    assert.ok(seen, `getLiveness did not return product ${row.id}`);
    assert.equal(seen.display, row.display);
    assert.equal(seen.sell_display, row.sell_display);
  }
});

// THE CREATE THAT COULD NOT HAVE WORKED. products.bullion declares seven
// columns NOT NULL that exchange.products defaults, and the insert this
// replaces named only three of them.
test("creating a product supplies what exchange defaults and bullion does not", async () => {
  await inRollback(async (c: PoolClient) => {
    const name = `probe-${randomUUID().slice(0, 8)}`;
    const made = await service.createProduct({ name }, c);
    assert.ok(made, "the product service returned nothing");

    assert.ok(made, "createProduct returned nothing");
    assert.equal(made.name, name);
    // The composed shape, which means all three reference rows resolved.
    assert.equal(typeof made.metal, "string");
    assert.equal(typeof made.mint, "string");
    assert.equal(typeof made.supplier, "string");

    const { rows } = await c.query(
      `SELECT metal_id, mint_id, supplier_id, image_front, image_back, stock, quantity
         FROM products.bullion WHERE id = $1`, [made.id]
    );
    for (const [k, v] of Object.entries(rows[0])) {
      assert.notEqual(v, null, `${k} was left null, which the column forbids`);
    }
  });
});

// THE EDITOR IS NOT AN ARGUMENT ANY MORE. saveProduct took `user: { name }`
// and the repo took an `actor`; migration 116 moved the write to the
// public.audit_stamp trigger, which reads app.actor_id off the connection. The
// claim is unchanged - a save records WHO edited - asked of the mechanism that
// answers it now, and of updated_by_id as well as the legacy name column.
test("saving a product writes the row, and records who saved it", async () => {
  await inRollback(async (c: PoolClient) => {
    const [existing] = await service.getAllAdminProducts();
    const renamed = `${existing.name}-renamed`;

    const { rows: admins } = await c.query(
      `SELECT id, name FROM auth.users WHERE role = 'admin' LIMIT 1`
    );
    assert.ok(admins[0], "auth.users has no admin - this test proves nothing");
    await c.query("SELECT set_config('app.actor_id', $1, true)", [admins[0].id]);

    const saved = await service.saveProduct({ product: { ...existing, name: renamed } }, c);
    assert.ok(saved, "saveProduct returned nothing");
    assert.equal(saved.id, existing.id);

    const { rows: nx } = await c.query(
      "SELECT name, updated_by, updated_by_id FROM products.bullion WHERE id = $1",
      [existing.id]
    );
    assert.equal(nx[0].name, renamed);
    assert.equal(nx[0].updated_by_id, admins[0].id, "the trigger did not stamp the actor");
    assert.equal(nx[0].updated_by, admins[0].name);
  });
});

// The three names the form sends are resolved to ids here, and a name matching
// nothing used to become NULL inside the UPDATE and fail on a NOT NULL column
// without saying which of the three was wrong.
test("an unknown metal, mint or supplier name is refused by name", async () => {
  const [existing] = await service.getAllAdminProducts();
  for (const [field, what] of [["metal", "metal"], ["mint", "mint"], ["supplier", "supplier"]]) {
    await assert.rejects(
      () => service.saveProduct({ product: { ...existing, [field]: "Unobtainium" } }),
      new RegExp(`no ${what} called "Unobtainium"`),
      `a bad ${field} was not refused by name`
    );
  }
});

test("a save with no id is refused rather than writing to nothing", async () => {
  const [existing] = await service.getAllAdminProducts();
  await assert.rejects(
    () => service.saveProduct({ product: { ...existing, id: undefined } }),
    /needs an id/
  );
});

test("a write made with a client is invisible on the pool", async () => {
  await client.query("BEGIN");
  const made = await service.createProduct(
    { name: `probe-${randomUUID().slice(0, 8)}` }, client
  );
  assert.ok(made, "createProduct returned nothing");
  const outsideRow = await service.getAdminProductById(made.id);
  await client.query("ROLLBACK");

  assert.ok(made.id);
  assert.equal(outsideRow, undefined);
});
