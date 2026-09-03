// Products through the service, against real Postgres — bid_premium/ask_premium feed every price quote (calculateItemPrice = content * bid_spot * premium), so a divergence here misprices orders, not just displays oddly.
import { test, afterAll, beforeAll } from "vitest";
import assert from "node:assert/strict";
import type { PoolClient } from "pg";
import { randomUUID } from "node:crypto";
import pool from "#db";
import { inRollback } from "#shared/testing/rollback.ts";
import { inPinnedTransaction } from "#shared/testing/pinned-pool.ts";
import { actingAs, TEST_ACTOR } from "#shared/testing/actor.ts";
// LOCKS.ORDERS because the two PINNED tests here reach products through the
// service, whose module graph writes orders.* - lint:test-locks derives that
// and requires the lock at every pinned call in the file.
import { LOCKS } from "#shared/testing/locks.ts";
import { aProduct, anAdmin } from "#shared/testing/builders/index.ts";
import * as service from "#domain/products/service.ts";
import * as productsRepo from "#db/products/repo.ts";

let client: PoolClient;

beforeAll(async () => {
  assert.equal(
    new Date().getTimezoneOffset(), 0,
    "these tests require TZ=UTC - run them with `pnpm --filter @dorado/api test`"
  );
  client = await pool.connect();
});

afterAll(async () => {
  client.release();
  await pool.end();
});

// A product missing any of the three labels was dropped by the inner joins, and is dropped by compose.ts too.
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

// The lists differ only in their WHERE clause, and each is a different promise: `display` is what a customer may buy, `sell_display` what they may sell — swapping them is invisible in a shape check.
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
  // Checked non-empty first: these loops pass vacuously on an empty result, and "returns nothing" is exactly the failure a read pivot produces pointing at an unwritten table.
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

// A slug is a public URL; without `display` in the statement, an unpublished product would be readable by anyone who knows its slug.
// The count is not asserted to be one — a slug names a variant SET (gold-american-eagle is four rows); an earlier version asserted 1 and failed against real data.
test("an undisplayed product is not reachable by its slug", async () => {
  // PINNED, NOT MERELY ROLLED BACK: getProductFromSlug reads through the pool
  // and takes no executor, so a plain BEGIN/ROLLBACK on one client would leave
  // the service unable to see the product this test builds.
  await inPinnedTransaction(async (c: PoolClient) => {
    // BUILT, DISPLAYED, WITH ITS OWN SLUG (lane 1). This picked whichever
    // displayed product came first and then set `display = false` on every row
    // sharing its slug - a real catalogue entry, hidden, and correct only
    // because the transaction rolls back. It also RETURNED EARLY when the
    // query found nothing, which is one of audit:vacuous-tests' five SKIPs.
    const live = await aProduct(c, { display: true, slug: `slug-probe-${randomUUID().slice(0, 8)}` });

    const shown = await service.getProductFromSlug(live.slug!);
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
  }, { actor: TEST_ACTOR.id, lock: LOCKS.ORDERS });
});

// The variant set itself, which is why the slug read returns a list at all.
test("a slug with variants returns every one of them", async () => {
  // A VARIANT SET IS BUILT (lane 1): three products sharing one slug and
  // differing by variant_label, which is what a slug NAMES. This hunted dev
  // for a slug with more than one row and RETURNED EARLY when it found none -
  // so on a database with no variants the test asserted nothing at all.
  //
  // It runs inside the rollback now, where it used to read on the file's own
  // client and then call the service on the pool: the service could not see a
  // built set otherwise.
  await inPinnedTransaction(async (c: PoolClient) => {
    const slug = `variant-set-${randomUUID().slice(0, 8)}`;
    for (const variant_label of ["1 oz", "1/2 oz", "1/10 oz"]) {
      await aProduct(c, { slug, variant_label, display: true });
    }

    const set = await service.getProductFromSlug(slug);
    assert.equal(set.length, 3, "the product page would be missing a size");
    assert.equal(new Set(set.map((p) => p.variant_label)).size, set.length,
      "two variants share a label, so the page cannot tell them apart");
  }, { actor: TEST_ACTOR.id, lock: LOCKS.ORDERS });
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
    // Guarded: `Map.get` is `| undefined`, and a product missing from the liveness read produced a TypeError rather than naming the id — the length check above doesn't cover it, since two same-length lists can hold different ids.
    const seen = byId.get(row.id);
    assert.ok(seen, `getLiveness did not return product ${row.id}`);
    assert.equal(seen.display, row.display);
    assert.equal(seen.sell_display, row.sell_display);
  }
});

// products.bullion declares seven columns NOT NULL that exchange.products defaults; the insert this replaces named only three of them.
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

// The editor is not an argument any more: migration 116 moved the write to the public.audit_stamp trigger, which reads app.actor_id off the connection. The claim is unchanged — a save records who edited — asked of the mechanism that answers it now.
test("saving a product writes the row, and records who saved it", async () => {
  await inRollback(async (c: PoolClient) => {
    const [existing] = await productsRepo.getAdminAll(c);
    assert.ok(existing, "dev has no product to read reference ids from");
    const renamed = `${existing.name}-renamed`;

    const admin = await anAdmin(c, { name: "Saving Admin" });
    await actingAs(c, admin.id);

    // metal_id/mint_id/supplier_id travel as ids now (ruling 43), read off
    // the raw admin row rather than resolved from the composed shape's names.
    const saved = await service.saveProduct({ product: { ...existing, name: renamed } }, c);
    assert.ok(saved, "saveProduct returned nothing");
    assert.equal(saved.id, existing.id);

    const { rows: nx } = await c.query(
      "SELECT name, updated_by, updated_by_id FROM products.bullion WHERE id = $1",
      [existing.id]
    );
    assert.equal(nx[0].name, renamed);
    assert.equal(nx[0].updated_by_id, admin.id, "the trigger did not stamp the actor");
    assert.equal(nx[0].updated_by, admin.name);
  });
});

// metal_id/mint_id/supplier_id are ids now, not names (ruling 43): an unknown
// id is refused by the database's own foreign key, not a name lookup this
// service used to run first. One transaction per field - a failed statement
// aborts the rest of its own transaction, so each gets its own BEGIN/ROLLBACK.
const NOBODY = "00000000-0000-0000-0000-000000000000";
for (const field of ["metal_id", "mint_id", "supplier_id"] as const) {
  test(`an unknown ${field} is refused by the database`, async () => {
    await inRollback(async (c: PoolClient) => {
      const [existing] = await productsRepo.getAdminAll(c);
      assert.ok(existing, "dev has no product to read reference ids from");
      await assert.rejects(
        () => service.saveProduct({ product: { ...existing, [field]: NOBODY } }, c),
        /foreign key|violates/i,
        `a bad ${field} was not refused`
      );
    });
  });
}

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
