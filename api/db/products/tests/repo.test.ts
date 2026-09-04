import { test, afterAll, beforeAll } from "vitest";
import assert from "node:assert/strict";
import pool from "#pool";
import { inRollback } from "#shared/testing/rollback.ts";
import * as repo from "#db/products/repo.ts";
import { aProduct } from "#shared/testing/builders/products.ts";

beforeAll(async () => {
  assert.equal(
    new Date().getTimezoneOffset(), 0,
    "these tests require TZ=UTC - run them with `pnpm --filter @dorado/api test`"
  );
});

afterAll(async () => {
  await pool.end();
});

const NOBODY = "00000000-0000-0000-0000-000000000000";

test("update returns false on a missing id", async () => {
  await inRollback(async (c) => {
    assert.equal(await repo.update(NOBODY, { name: "Test Product" }, c), false);
  });
});

test("update returns true on a real id, and the row reflects the patch", async () => {
  await inRollback(async (c) => {
    const product = await aProduct(c);
    assert.equal(await repo.update(product.id, { name: "Renamed Product" }, c), true);
    assert.equal((await repo.getOne(product.id, c))?.name, "Renamed Product");
  });
});

test("the id filter narrows, and an empty list asks for nothing", async () => {
  await inRollback(async (c) => {
    const product = await aProduct(c);
    const rows = await repo.listFor({ ids: [product.id] }, c);
    assert.deepEqual(rows.map((r) => r.id), [product.id]);
    assert.deepEqual(await repo.listFor({ ids: [] }, c), []);
  });
});

test("the buy gate is a filter, and omitting it is the sell side (ruling 49)", async () => {
  await inRollback(async (c) => {
    const hidden = await aProduct(c, { display: false });
    const gated = await repo.listFor({ display: true, ids: [hidden.id] }, c);
    assert.deepEqual(gated, []);
    const ungated = await repo.listFor({ ids: [hidden.id] }, c);
    assert.equal(ungated.length, 1);
  });
});

test("the metal, the category and the search term all narrow", async () => {
  await inRollback(async (c) => {
    const gold = await aProduct(c, { metal: "Gold", filter_category: "American Eagle" });
    const silver = await aProduct(c, { metal: "Silver", filter_category: "Maple" });

    const byMetal = await repo.listFor({ metal: "Silver", ids: [gold.id, silver.id] }, c);
    assert.deepEqual(byMetal.map((r) => r.id), [silver.id]);

    const byCategory = await repo.listFor(
      { filter_category: "American Eagle", ids: [gold.id, silver.id] }, c
    );
    assert.deepEqual(byCategory.map((r) => r.id), [gold.id]);

    const bySearch = await repo.listFor({ search: "silver", ids: [gold.id, silver.id] }, c);
    assert.deepEqual(bySearch.map((r) => r.id), [silver.id]);
  });
});

test("the row carries the metal's and the mint's names, joined", async () => {
  await inRollback(async (c) => {
    const product = await aProduct(c, { metal: "Platinum" });
    const [row] = await repo.listFor({ ids: [product.id] }, c);
    assert.equal(row?.metal_type, "Platinum");
    assert.ok(row?.mint_name);
    assert.equal(row?.metal_id, product.metal_id);
  });
});
