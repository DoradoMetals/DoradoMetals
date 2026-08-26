// The projections, which decide what leaves the API for a product.
//
// There are eight of them across two files: exchange.products and the new
// products.bullion, each with a public and an admin list, each of those with a
// `WITH_ALIAS` twin for the joined queries. Eight lists, four of which must
// agree pairwise, and none had a test.
//
// constants.bullion.ts states the hazard itself: "a projection that silently
// grew is how columns start leaking onto the wire". validate:wire now refuses
// a field no contract declares, which catches a leak that reaches one of its
// 61 endpoint shapes. This catches the ones that do not - a drift between a
// list and its alias twin, or an admin-only column appearing in a public list.
import test from "node:test";
import assert from "node:assert/strict";
import * as exchange from "#features/products/constants.ts";
import * as bullion from "#features/products/constants.bullion.ts";

// The name a field arrives under: the alias if there is one, else the column.
const projected = (sql) =>
  sql
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean)
    .map((part) => {
      const alias = part.match(/\bAS\s+(\w+)/i);
      return (alias ? alias[1] : part.split(/\s+/).pop()).split(".").pop();
    });

const PAIRS = [
  ["PRODUCT_FIELDS", exchange.PRODUCT_FIELDS, exchange.PRODUCT_FIELDS_WITH_ALIAS],
  ["ADMIN_PRODUCT_FIELDS", exchange.ADMIN_PRODUCT_FIELDS, exchange.ADMIN_PRODUCT_FIELDS_WITH_ALIAS],
  ["BULLION_PRODUCT_FIELDS", bullion.BULLION_PRODUCT_FIELDS, bullion.BULLION_PRODUCT_FIELDS_WITH_ALIAS],
  ["BULLION_ADMIN_PRODUCT_FIELDS", bullion.BULLION_ADMIN_PRODUCT_FIELDS, bullion.BULLION_ADMIN_PRODUCT_FIELDS_WITH_ALIAS],
];

test("the lists are real, so nothing below passes by reading an empty string", () => {
  for (const [name, plain, alias] of PAIRS) {
    assert.ok(projected(plain).length >= 15, `${name} projects only ${projected(plain).length} field(s)`);
    assert.ok(projected(alias).length >= 15, `${name}_WITH_ALIAS projects only ${projected(alias).length}`);
  }
});

for (const [name, plain, alias] of PAIRS) {
  test(`${name} and its alias twin project the same fields, in the same order`, () => {
    assert.deepEqual(projected(alias), projected(plain));
  });
}

// The disclosure boundary. Whatever else changes, the public list must not
// acquire a field the admin list keeps to itself.
for (const [label, pub, adm] of [
  ["exchange", exchange.PRODUCT_FIELDS, exchange.ADMIN_PRODUCT_FIELDS],
  ["bullion", bullion.BULLION_PRODUCT_FIELDS, bullion.BULLION_ADMIN_PRODUCT_FIELDS],
]) {
  test(`${label}: everything public is also admin, and nine fields are admin-only`, () => {
    const p = new Set(projected(pub));
    const a = new Set(projected(adm));
    assert.deepEqual([...p].filter((f) => !a.has(f)), [], "a public field is not in the admin list");
    assert.deepEqual([...a].filter((f) => !p.has(f)).sort(), [
      "created_at",
      "created_by",
      "display",
      "filter_category",
      "homepage_display",
      "quantity",
      "stock",
      "updated_at",
      "updated_by",
    ]);
  });
}

// The two files select from differently named columns - exchange has
// product_name, products.bullion has name - but both alias UP to the same
// shape, because one contract describes both and validate:wire parses each
// through it. If one grows a column the other lacks, the shapes part company.
test("the exchange and bullion lists deliver the same shape from different columns", () => {
  assert.deepEqual(projected(bullion.BULLION_PRODUCT_FIELDS), projected(exchange.PRODUCT_FIELDS));
  assert.deepEqual(
    projected(bullion.BULLION_ADMIN_PRODUCT_FIELDS),
    projected(exchange.ADMIN_PRODUCT_FIELDS)
  );
  // And they really are different underneath, or the check above is trivial.
  assert.match(exchange.PRODUCT_FIELDS, /product_name AS name/);
  assert.doesNotMatch(bullion.BULLION_PRODUCT_FIELDS, /product_name/);
});
