// A product save cannot quietly lose a product: NOT NULL constraints on exchange.products (metal_id, supplier_id, mint_id, content, gross, purity, and more) make an unmatched-name subquery's NULL abort the whole UPDATE. This pins that refusal against a future migration relaxing one of those columns to nullable.
// Answers 500 where 400 would be right (same shape as 9a82a7ed's fulfillment refusals) — recorded, not changed.
import { test, afterAll, beforeAll } from "vitest";
import assert from "node:assert/strict";
import type { ProductsRow } from "@dorado/contracts";
import type { PoolClient } from "pg";
import request from "supertest";
import pool from "#db";
import { mockSessions, restoreSessions, as } from "#shared/testing/session.ts";
import { inPinnedTransaction, outside } from "#shared/testing/pinned-pool.ts";

await mockSessions();
const { default: app } = await import("#app");

// SELECT projections, not table rows.
type UserFixture = { id: string; name: string | null; email: string | null };
// `SELECT p.*` plus three joined display names — the row half comes from the generated contract rather than being restated, since `fullBody` below already maps its columns.
type ProductFixture = ProductsRow & {
  metal: string;
  supplier: string | null;
  mint: string | null;
};

let admin: UserFixture;
let product: ProductFixture;

beforeAll(async () => {
  admin = (
    await outside<UserFixture>(`SELECT id, name, email FROM exchange.users WHERE role = 'admin' LIMIT 1`)
  )[0];
  assert.ok(admin, "dev has no admin user");

  // Derived from the row under test, metal name included, so the "honest save" half can't pass by naming a metal that happens to exist. The whole row plus three names, so it sends what the admin screen sends rather than a fragment.
  product = (
    await outside<ProductFixture>(
      `SELECT p.*, m.type AS metal, s.name AS supplier, mi.name AS mint
         FROM exchange.products p
         JOIN exchange.metals m ON m.id = p.metal_id
         JOIN exchange.suppliers s ON s.id = p.supplier_id
         JOIN exchange.mints mi ON mi.id = p.mint_id
        LIMIT 1`
    )
  )[0];
  assert.ok(product, "dev has no product joined to a metal");
});

afterAll(async () => {
  restoreSessions();
  await pool.end();
});

// Everything updateProduct writes, mapped from the row it was read from.
const fullBody = (metalName: string) => ({
  id: product.id,
  metal: metalName,
  supplier: product.supplier,
  mint: product.mint,
  name: product.product_name,
  description: product.product_description,
  bid_premium: product.bid_premium,
  ask_premium: product.ask_premium,
  type: product.product_type,
  display: product.display,
  content: product.content,
  gross: product.gross,
  purity: product.purity,
  variant_group: product.variant_group,
  shadow_offset: product.shadow_offset,
  stock: product.stock,
  slug: product.slug,
  homepage_display: product.homepage_display,
  legal_tender: product.legal_tender,
  domestic_tender: product.domestic_tender,
  sell_display: product.sell_display,
  is_generic: product.is_generic,
  variant_label: product.variant_label,
  quantity: product.quantity,
  image_front: product.image_front,
  image_back: product.image_back,
  filter_category: product.filter_category,
});

const saveFull = (metalName: string) =>
  request(app)
    .post("/api/products/save_product")
    .send({ product: fullBody(metalName), user: { name: "test-admin" } });

const save = (metalName: string) =>
  request(app)
    .post("/api/products/save_product")
    .send({
      product: {
        id: product.id,
        name: product.product_name,
        metal: metalName,
      },
      user: { name: "test-admin" },
    });

test("a metal name that does not exist is refused, and nothing is written", async () => {
  // Read through a separate connection, not the pinned one: the constraint violation aborts that transaction (Postgres 25P02), so a read-back on the pinned client after the failed save cannot run at all — outside() sees committed data instead.
  const [before] = await outside(
    `SELECT metal_id FROM exchange.products WHERE id = $1`,
    [product.id]
  );

  await inPinnedTransaction(async () => {
    await as({ ...admin, role: "admin" }, async () => {
      // A full body, so the metal name is the only thing wrong with it.
      const res = await saveFull("Unobtainium");

      // 500 today — asserted as "not a success" rather than an exact code, so improving it to 400 later won't fail this test.
      assert.ok(res.status >= 400, `an unmatched metal name was answered ${res.status}`);
    });
  });

  const [after] = await outside(
    `SELECT metal_id FROM exchange.products WHERE id = $1`,
    [product.id]
  );
  assert.equal(after.metal_id, before.metal_id, "the failed save changed the product");
  assert.ok(after.metal_id, "the product lost its metal");
});

// The other half — without it, this suite would pass against a save_product that refuses EVERYTHING: secure, broken, and unusable for admins.
test("a save naming the product's own metal succeeds and keeps the link", async () => {
  await inPinnedTransaction(async (client: PoolClient) => {
    await as({ ...admin, role: "admin" }, async () => {
      const res = await saveFull(product.metal);
      assert.equal(res.status, 200, `an honest save answered ${res.status}`);

      const { rows } = await client.query(
        `SELECT metal_id, product_name FROM exchange.products WHERE id = $1`,
        [product.id]
      );
      assert.equal(rows[0].metal_id, product.metal_id, "an honest save lost the metal");
      assert.equal(rows[0].product_name, product.product_name);
    });
  });
});
