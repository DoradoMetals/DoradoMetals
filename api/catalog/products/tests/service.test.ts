import { test, afterAll, beforeAll } from "vitest";
import assert from "node:assert/strict";
import type { PoolClient } from "pg";
import { randomUUID } from "node:crypto";
import pool from "#pool";
import { inPinnedTransaction } from "#shared/testing/pinned-pool.ts";
import { TEST_ACTOR } from "#shared/testing/actor.ts";
import { LOCKS } from "#shared/testing/locks.ts";
import { aProduct, mintId, supplierId } from "#shared/testing/builders/index.ts";
import * as service from "#catalog/products/service.ts";

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

const rowsOf = (groups: Awaited<ReturnType<typeof service.listGroups>>) =>
  groups.flatMap((g) => (g.variants.length ? g.variants : [g.default]));

test("the storefront carries the metal and mint names", async () => {
  const rows = rowsOf(await service.listGroups({ display: true }));
  assert.ok(rows.length > 0, "dev has no displayed products");
  for (const row of rows) {
    assert.equal(typeof row.metal_id, "string", `${row.name} has no metal_id`);
    assert.equal(typeof row.mint_name, "string", `${row.name} has no mint_name`);
  }
});

test("the storefront returns no admin-only field", async () => {
  const [row] = rowsOf(await service.listGroups({ display: true }));
  for (const field of [
    "display", "created_by", "updated_by", "created_at", "updated_at",
    "homepage_display", "filter_category", "supplier", "supplier_id",
  ]) {
    assert.ok(!(field in row), `${field} is admin-only and reached the storefront`);
  }
});

test("the admin list carries all three names and neither actor id", async () => {
  const rows = await service.listAdminProducts();
  assert.ok(rows.length > 0, "dev has no products");
  for (const row of rows) {
    assert.equal(typeof row.metal_id, "string");
    assert.equal(typeof row.mint, "string");
    assert.equal(typeof row.supplier, "string");
    for (const id of ["created_by_id", "updated_by_id"]) {
      assert.ok(!(id in row), `${id} reached the admin response`);
    }
  }
});

test("the buy gate is a filter; omitting it is the sell side", async () => {
  const [buy, sell] = await Promise.all([
    service.listGroups({ display: true }), service.listGroups({}),
  ]);
  const { rows: everyProduct } = await client.query(
    "SELECT id, display FROM products.bullion"
  );
  assert.ok(everyProduct.some((r) => r.display === false),
    "dev has no hidden product, so this test cannot tell 'no gate' from 'wide open gate'");

  assert.equal(rowsOf(sell).length, everyProduct.length,
    "the sell list does not return every product any more");

  const hidden = new Set(everyProduct.filter((r) => !r.display).map((r) => r.id));
  for (const row of rowsOf(buy)) {
    assert.ok(!hidden.has(row.id), `${row.name} is hidden and reached the buy storefront`);
  }
});

test("the homepage filter also keeps the buy gate", async () => {
  const rows = rowsOf(await service.listGroups({ display: true, homepage_display: true }));
  if (rows.length === 0) return assert.ok(true, "dev has no homepage product");
  const { rows: flags } = await client.query(
    "SELECT id, display, homepage_display FROM products.bullion WHERE id = ANY($1::uuid[])",
    [rows.map((r) => r.id)]
  );
  for (const row of flags) {
    assert.equal(row.homepage_display, true);
    assert.equal(row.display, true, "an undisplayed product is on the homepage");
  }
});

test("a slug answers one group, heaviest first", async () => {
  await inPinnedTransaction(async (c: PoolClient) => {
    const slug = `variant-set-${randomUUID().slice(0, 8)}`;
    const group_name = `family-${randomUUID().slice(0, 8)}`;
    for (const [variant_label, content] of [["1 oz", 1], ["1/2 oz", 0.5], ["1/10 oz", 0.1]] as const) {
      await aProduct(c, { slug, variant_label, content, variant_group: group_name, display: true });
    }

    const group = await service.getGroupBySlug(slug);
    assert.equal(group.variants.length, 3, "the product page would be missing a size");
    assert.deepEqual(group.variants.map((v) => v.variant_label), ["1 oz", "1/2 oz", "1/10 oz"]);
    assert.equal(group.default.variant_label, "1 oz", "the headline row is not the heaviest");
  }, { actor: TEST_ACTOR.id, lock: LOCKS.ORDERS });
});

test("a product with no family is a group of one, carrying no variants", async () => {
  await inPinnedTransaction(async (c: PoolClient) => {
    const built = await aProduct(c, { display: true, variant_group: "" });
    const group = await service.getGroupBySlug(built.slug!);
    assert.equal(group.default.id, built.id);
    assert.deepEqual(group.variants, []);
  }, { actor: TEST_ACTOR.id, lock: LOCKS.ORDERS });
});

test("an undisplayed product is not reachable by its slug", async () => {
  await inPinnedTransaction(async (c: PoolClient) => {
    const hidden = await aProduct(c, {
      display: false, slug: `slug-probe-${randomUUID().slice(0, 8)}`,
    });
    await assert.rejects(() => service.getGroupBySlug(hidden.slug!), /no product/);
  }, { actor: TEST_ACTOR.id, lock: LOCKS.ORDERS });
});

test("filtering by metal name returns that metal's products and no others", async () => {
  const all = rowsOf(await service.listGroups({ display: true }));
  const metal_id = all[0]!.metal_id;
  const filtered = rowsOf(await service.listGroups({ display: true, metal_id }));
  assert.ok(filtered.length > 0, `no products came back for ${metal_id}`);
  for (const row of filtered) assert.equal(row.metal_id, metal_id);
  assert.equal(
    filtered.length, all.filter((p) => p.metal_id === metal_id).length,
    "the filter and the full list disagree about how many that metal has"
  );
});

test("an unknown metal name returns nothing, not everything", async () => {
  assert.deepEqual(await service.listGroups({ display: true, metal_id: "Unobtainium" }), []);
});

test("liveness answers display, the buy-side gate", async () => {
  const { rows } = await client.query("SELECT id, display FROM products.bullion LIMIT 5");
  const live = await service.getLiveness(rows.map((r) => r.id));
  assert.equal(live.length, rows.length);
  const byId = new Map(live.map((r) => [r.id, r]));
  for (const row of rows) {
    const seen = byId.get(row.id);
    assert.ok(seen, `getLiveness did not return product ${row.id}`);
    assert.equal(seen.display, row.display);
  }
});

test("creating a product supplies what the columns require", async () => {
  await inPinnedTransaction(async (c: PoolClient) => {
    const name = `probe-${randomUUID().slice(0, 8)}`;
    const made = await service.createProduct({
      name,
      metal_id: "Gold",
      mint_id: await mintId(c),
      supplier_id: await supplierId(c),
    });
    assert.equal(made.name, name);
    assert.equal(made.metal_id, "Gold");
    assert.equal(typeof made.mint, "string");
    assert.equal(typeof made.supplier, "string");

    const { rows } = await c.query(
      `SELECT metal_id, mint_id, supplier_id, image_front, image_back
         FROM products.bullion WHERE id = $1`, [made.id]
    );
    for (const [k, v] of Object.entries(rows[0])) {
      assert.notEqual(v, null, `${k} was left null, which the column forbids`);
    }
    assert.equal(rows[0].image_front, "", "the column default should have filled image_front");
    assert.equal(rows[0].image_back, "", "the column default should have filled image_back");
  }, { actor: TEST_ACTOR.id, lock: LOCKS.ORDERS });
});

test("updating a product writes the row, and records who saved it", async () => {
  await inPinnedTransaction(async (c: PoolClient) => {
    const built = await aProduct(c);
    const renamed = `${built.name}-renamed`;
    const saved = await service.updateProduct(built.id, { name: renamed });
    assert.equal(saved.name, renamed);

    const { rows } = await c.query(
      "SELECT name, updated_by, updated_by_id FROM products.bullion WHERE id = $1",
      [built.id]
    );
    assert.equal(rows[0].name, renamed);
    assert.equal(rows[0].updated_by_id, TEST_ACTOR.id, "the trigger did not stamp the actor");
    assert.equal(rows[0].updated_by, TEST_ACTOR.name);
  }, { actor: TEST_ACTOR.id, lock: LOCKS.ORDERS });
});

test("updating a product nobody has is a refusal, not a silent no-op", async () => {
  await assert.rejects(
    () => service.updateProduct("00000000-0000-0000-0000-000000000000", { name: "x" }),
    /no product/
  );
});

const NOBODY = "00000000-0000-0000-0000-000000000000";
for (const field of ["metal_id", "mint_id", "supplier_id"] as const) {
  test(`an unknown ${field} is refused by the database`, async () => {
    await inPinnedTransaction(async (c: PoolClient) => {
      const built = await aProduct(c);
      await assert.rejects(
        () => service.updateProduct(built.id, { [field]: NOBODY }),
        new RegExp(`${field}: no such row`),
        `a bad ${field} was not refused`
      );
    }, { actor: TEST_ACTOR.id, lock: LOCKS.ORDERS });
  });
}
