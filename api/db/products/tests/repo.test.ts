// products.bullion, the CRUD floor, against real Postgres.
//
// One test proves what every repo's update must: a missing id changes nothing
// and says so (false), a real id changes exactly one row and says so (true).
import { test, afterAll, beforeAll } from "vitest";
import assert from "node:assert/strict";
import type { PoolClient } from "pg";
import { randomUUID } from "node:crypto";
import pool from "#db";
import { inRollback } from "#shared/testing/rollback.ts";
import * as repo from "#db/products/repo.ts";
import type { ProductPatch } from "#db/products/repo.ts";


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

// Same shape saveProduct builds; metal_id/mint_id/supplier_id are read from a real product so the foreign keys resolve.
function patchFor(existing: { metal_id: string; supplier_id: string; mint_id: string }, name: string): ProductPatch {
  return {
    metal_id: existing.metal_id,
    supplier_id: existing.supplier_id,
    mint_id: existing.mint_id,
    name,
    description: "Test Description",
    bid_premium: 0,
    ask_premium: 0,
    type: "Coin",
    display: true,
    content: 1,
    gross: 1,
    purity: 0.999,
    variant_group: "",
    shadow_offset: 0,
    stock: 0,
    slug: null,
    homepage_display: false,
    legal_tender: false,
    domestic_tender: false,
    is_generic: false,
    variant_label: "",
    quantity: 0,
    image_front: "/x/front.png",
    image_back: "/x/back.png",
    filter_category: null,
  };
}

test("update returns false on a missing id", async () => {
  await inRollback(async (c) => {
    const [existing] = await repo.getAdminAll(c);
    assert.ok(existing, "dev has no product to read reference ids from");
    const ok = await repo.update(NOBODY, patchFor(existing, "Test Product"), c);
    assert.equal(ok, false);
  });
});

test("update returns true on a real id, and the row reflects the patch", async () => {
  await inRollback(async (c) => {
    const [existing] = await repo.getAdminAll(c);
    assert.ok(existing, "dev has no product to read reference ids from");
    const ok = await repo.update(existing.id, patchFor(existing, "Renamed Product"), c);
    assert.equal(ok, true);

    const row = await repo.getAdminOne(existing.id, c);
    assert.equal(row?.name, "Renamed Product");
  });
});
