// A product save cannot quietly lose a product, and the reason is the schema.
//
// updateProduct resolves three foreign keys by NAME inside the statement that
// writes everything else:
//
//   metal_id    = (SELECT id FROM exchange.metals    WHERE type = $1)
//   supplier_id = (SELECT id FROM exchange.suppliers WHERE name = $2)
//   mint_id     = (SELECT id FROM exchange.mints     WHERE name = $12)
//
// A subquery that matches nothing yields NULL, and every other column is
// written from the request body too - so the obvious worry is that a save
// carrying a typo'd metal name, or a partial body, silently disconnects a
// product from the metal that prices it, or blanks half its columns.
//
// THAT WAS MY HYPOTHESIS AND IT IS WRONG. exchange.products declares metal_id,
// supplier_id, mint_id, content, gross, purity, ask_premium, bid_premium and
// fifteen more as NOT NULL. The subquery's NULL violates the constraint, the
// whole UPDATE rolls back, and the product is untouched. The database is doing
// exactly the job the constraints exist for.
//
// It also explains a production reading rather than leaving it to luck: 95
// products, zero with a null metal_id, supplier_id, mint_id, content or
// ask_premium. That is the constraints holding, not a near miss.
//
// SO WHY KEEP A TEST. Because the protection lives in the schema rather than in
// the code, and this migration rewrites schemas. A future `orders`-style rebuild
// that relaxes one of those columns to nullable would turn a refusal into a
// silent disconnection, and nothing else would notice. This pins it.
//
// The one real blemish is the status code: it answers 500 where 400 would be
// right, the same shape as the fulfillment refusals in 9a82a7ed. Nothing is
// lost, so it is recorded rather than changed.
//
// Safe to drive: save_product is pure database work - no MinIO, no carrier -
// and inPinnedTransaction rolls it back. It was on the "needs a seam" list and
// did not need one, which is the third time that list has been wrong.
import test, { after, before } from "node:test";
import assert from "node:assert/strict";
import request from "supertest";
import pool from "#db";
import { mockSessions, restoreSessions, as } from "#shared/testing/session.ts";
import { inPinnedTransaction, outside } from "#shared/testing/pinned-pool.ts";

await mockSessions();
const { default: app } = await import("#app");

let admin, product;

before(async () => {
  admin = (
    await outside(`SELECT id, name, email FROM exchange.users WHERE role = 'admin' LIMIT 1`)
  )[0];
  assert.ok(admin, "dev has no admin user");

  // Derived from the row it is tested against, metal name included, so the
  // "honest save" half cannot pass by naming a metal that happens to exist.
  // The whole row plus the three names, so the honest-save half sends what the
  // admin screen sends rather than a fragment - a partial body is refused by
  // the NOT NULL columns, which is the very thing being asserted above.
  product = (
    await outside(
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

after(async () => {
  restoreSessions();
  await pool.end();
});

// Everything updateProduct writes, mapped from the row it was read from.
const fullBody = (metalName) => ({
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

const saveFull = (metalName) =>
  request(app)
    .post("/api/products/save_product")
    .send({ product: fullBody(metalName), user: { name: "test-admin" } });

const save = (metalName) =>
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
  // READ THROUGH A SEPARATE CONNECTION, NOT THE PINNED ONE.
  //
  // The constraint violation aborts the transaction it happens in - Postgres
  // 25P02, "current transaction is aborted, commands ignored until end of
  // transaction block" - so a read-back on the pinned client after the failed
  // save cannot run at all. The first version of this test did exactly that and
  // failed for that reason rather than for anything about the product.
  //
  // outside() is a connection the pin never touches, so it answers with
  // committed data. That is the right question anyway: did the failed save
  // leave anything behind.
  const [before] = await outside(
    `SELECT metal_id FROM exchange.products WHERE id = $1`,
    [product.id]
  );

  await inPinnedTransaction(async () => {
    await as({ ...admin, role: "admin" }, async () => {
      // A full body, so the metal name is the only thing wrong with it.
      const res = await saveFull("Unobtainium");

      // 500 today. The assertion is deliberately "not a success" rather than an
      // exact code, because 400 would be the better answer and improving it
      // should not fail this test - what matters is that it did not succeed.
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

// The other half. Without it this suite would pass against a save_product that
// refuses EVERYTHING, which is secure, broken, and would stop admins editing
// the catalogue at all.
test("a save naming the product's own metal succeeds and keeps the link", async () => {
  await inPinnedTransaction(async (client) => {
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
