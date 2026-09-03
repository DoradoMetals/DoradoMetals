// A product save cannot quietly lose a product: products.bullion declares metal_id/supplier_id/mint_id (and more) NOT NULL with a foreign key, so an id that names no row is refused by the database rather than silently nulled.
//
// metal_id/supplier_id/mint_id travel as IDS now, not names (ruling 43): the
// old version of this file read exchange.products/exchange.metals/
// exchange.suppliers by name and sent a name in the body, which the service
// resolved with an in-memory lookup. That lookup is gone; the contract is the
// server's own row shape, and an unmatched id is the database's own foreign
// key refusal, not a name this service used to check first.
import test, { after, before } from "node:test";
import assert from "node:assert/strict";
import type { PoolClient } from "pg";
import request from "supertest";
import pool from "#db";
import * as productsRepo from "#db/products/repo.ts";
import type { AdminProductRow } from "#db/products/repo.ts";
import { mockSessions, restoreSessions, as } from "#shared/testing/session.ts";
import { inPinnedTransaction, outside } from "#shared/testing/pinned-pool.ts";

await mockSessions();
const { default: app } = await import("#app");

type UserFixture = { id: string; name: string | null; email: string | null };

let admin: UserFixture;
let product: AdminProductRow;

before(async () => {
  admin = (
    await outside<UserFixture>(`SELECT id, name, email FROM exchange.users WHERE role = 'admin' LIMIT 1`)
  )[0];
  assert.ok(admin, "dev has no admin user");

  const [row] = await productsRepo.getAdminAll();
  assert.ok(row, "dev has no product in products.bullion");
  product = row;
});

after(async () => {
  restoreSessions();
  await pool.end();
});

const NOBODY = "00000000-0000-0000-0000-000000000000";

// Everything saveProduct writes, mapped from the row it was read from - the
// full-replace body the admin form sends.
const fullBody = (metal_id: string) => ({
  id: product.id,
  metal_id,
  supplier_id: product.supplier_id,
  mint_id: product.mint_id,
  name: product.name,
  description: product.description,
  bid_premium: product.bid_premium,
  ask_premium: product.ask_premium,
  type: product.type,
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

const saveFull = (metal_id: string) =>
  request(app).post("/api/products/save_product").send({ product: fullBody(metal_id) });

test("a metal id that does not exist is refused, and nothing is written", async () => {
  // Read through a separate connection, not the pinned one: a foreign-key
  // violation aborts that transaction (Postgres 25P02), so a read-back on the
  // pinned client after the failed save cannot run at all - outside() sees
  // committed data instead.
  const [before] = await outside(
    `SELECT metal_id FROM products.bullion WHERE id = $1`,
    [product.id]
  );

  await inPinnedTransaction(async () => {
    await as({ ...admin, role: "admin" }, async () => {
      // A full body, so the metal id is the only thing wrong with it.
      const res = await saveFull(NOBODY);
      assert.ok(res.status >= 400, `an unmatched metal id was answered ${res.status}`);
    });
  });

  const [afterRow] = await outside(
    `SELECT metal_id FROM products.bullion WHERE id = $1`,
    [product.id]
  );
  assert.equal(afterRow.metal_id, before.metal_id, "the failed save changed the product");
  assert.ok(afterRow.metal_id, "the product lost its metal");
});

// The other half - without it, this suite would pass against a save_product that refuses EVERYTHING: secure, broken, and unusable for admins.
test("a save naming the product's own metal id succeeds and keeps the link", async () => {
  await inPinnedTransaction(async (client: PoolClient) => {
    await as({ ...admin, role: "admin" }, async () => {
      const res = await saveFull(product.metal_id);
      assert.equal(res.status, 200, `an honest save answered ${res.status}: ${JSON.stringify(res.body)}`);

      const { rows } = await client.query(
        `SELECT metal_id, name FROM products.bullion WHERE id = $1`,
        [product.id]
      );
      assert.equal(rows[0].metal_id, product.metal_id, "an honest save lost the metal");
      assert.equal(rows[0].name, product.name);
    });
  });
});
