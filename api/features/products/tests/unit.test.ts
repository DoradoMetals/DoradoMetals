// The parts of products that need no database: the write statements as text,
// and the in-memory join that replaced three SQL ones.
//
// The projections have their own file - tests/constants.test.js - because they
// are also compared against the exchange field lists that checkout still uses.
import test from "node:test";
import assert from "node:assert/strict";
import { sqlWithLegacy } from "#shared/testing/sql.ts";
import { storefront, admin } from "#features/products/compose.ts";
import type { Labels } from "#features/products/compose.ts";

// features/products/sql AND legacy/products/sql - the two halves of the
// dual write, pinned against each other in one file (ruling 29 moved the
// mirror out of this feature; the pin did not follow it, because the pin IS
// the comparison between the two).
const sql = sqlWithLegacy("products");

const body = (name: string): string =>
  sql(name).split("\n").filter((l) => !l.trim().startsWith("--")).join("\n");

// The SET assignments, ordered by parameter number. The WHERE key is dropped:
// `WHERE id = $28` matches the same pattern and is not a value being written.
const updateColumns = (name: string): string[] =>
  [...body(name).matchAll(/(\w+)\s*=\s*\$(\d+)/g)]
    .filter(([, , n]) => Number(n) <= 27)
    .sort((a, b) => Number(a[2]) - Number(b[2]))
    .map(([, col]) => col);

test("every statement loads and is not empty", () => {
  for (const n of [
    "get_storefront", "get_sell", "get_homepage", "get_by_slug", "get_by_ids",
    "get_filtered", "get_admin_all", "get_admin_one", "get_liveness",
    "get_types", "create", "update", "legacy/create", "legacy/update",
  ]) {
    assert.ok(sql(n).trim().length > 0, `${n} is empty`);
  }
});

// THE THREE RENAMES. products.bullion calls them name, description and type;
// exchange calls them product_name, product_description and product_type. One
// values array feeds both UPDATEs, so the two must line up parameter for
// parameter with exactly those three substitutions.
const RENAMES: Record<string, string> = {
  name: "product_name",
  description: "product_description",
  type: "product_type",
};

test("both UPDATEs assign the same values in the same order, renames aside", () => {
  const next = updateColumns("update").filter((c) => c !== "updated_at");
  const legacy = updateColumns("legacy/update").filter((c) => c !== "updated_at");

  assert.equal(next.length, 27, "the update column count changed - ProductValues has 27 entries");
  assert.deepEqual(
    next.map((c) => RENAMES[c] ?? c), legacy,
    "the two UPDATE statements no longer line up parameter for parameter"
  );

  // And the renames really are there, so this cannot pass by both sides having
  // dropped them.
  for (const [newName, oldName] of Object.entries(RENAMES)) {
    assert.ok(next.includes(newName), `sql/update.sql no longer writes ${newName}`);
    assert.ok(legacy.includes(oldName), `sql/legacy/update.sql no longer writes ${oldName}`);
  }
});

// exchange's UPDATE never maintained updated_at, and the new one does. That is
// a deliberate asymmetry rather than an oversight: adding it to exchange would
// make every mirrored row's timestamp disagree with the one the backfill
// copied, and verify:parity compares them.
test("only the new schema's update maintains updated_at", () => {
  assert.match(body("update"), /updated_at\s*=\s*NOW\(\)/i);
  assert.doesNotMatch(body("legacy/update"), /updated_at\s*=\s*NOW\(\)/i);
});

// The reference columns are IDS in the statement. The implementation this
// replaces resolved NAMES with three scalar subqueries inside the UPDATE, so a
// name matching nothing became NULL and failed on a NOT NULL column without
// saying which of the three was wrong.
test("the update takes ids, not names resolved by a subquery", () => {
  for (const table of ["metals.metals", "products.mints", "refiners."]) {
    assert.ok(!body("update").includes(table), `sql/update.sql still reaches into ${table}`);
  }
  assert.doesNotMatch(body("update"), /SELECT/i, "sql/update.sql contains a subquery");
});

// THE SEVEN COLUMNS exchange DEFAULTS AND products.bullion DOES NOT. If the
// create statement ever stops naming one, the insert raises 23502 - which is
// exactly what the migrated insert this replaces would have done.
test("create names every column bullion declares NOT NULL without a default", () => {
  for (const col of [
    "metal_id", "mint_id", "supplier_id", "image_front", "image_back",
    "stock", "quantity",
  ]) {
    assert.match(body("create"), new RegExp(`\\b${col}\\b`),
      `sql/create.sql does not supply ${col}, which products.bullion requires`);
  }
});

// exchange's create supplies almost nothing, because its columns default. The
// asymmetry between the two create statements is the whole point.
test("the exchange create relies on defaults and the new one cannot", () => {
  assert.doesNotMatch(body("legacy/create"), /metal_id/,
    "the exchange insert names metal_id - it has a DEFAULT and does not need to");
  assert.match(body("legacy/create"), /product_name/);
});

test("no statement reaches into the other schema", () => {
  for (const n of ["get_storefront", "get_sell", "get_homepage", "get_by_slug",
                   "get_by_ids", "get_filtered", "get_admin_all", "get_admin_one",
                   "get_liveness", "get_types", "create", "update"]) {
    assert.doesNotMatch(body(n), /exchange\./, `${n} reaches into exchange`);
  }
  for (const n of ["legacy/create", "legacy/update"]) {
    assert.doesNotMatch(body(n), /products\.bullion/, `${n} reaches out of exchange`);
  }
});

// One join, not three. A statement that grew one back would work and would
// quietly reintroduce the per-query cost the composition removed.
test("no read joins a reference table", () => {
  for (const n of ["get_storefront", "get_admin_all"]) {
    assert.doesNotMatch(body(n), /\bJOIN\b/i, `${n} joins - the labels come from compose.ts`);
  }
});

// ---------------------------------------------------------------- compose.ts

const labels: Labels = {
  metalNames: new Map([["m1", "Gold"]]),
  mintNames: new Map([["mi1", "US Mint"]]),
  refinerNames: new Map([["r1", "Elemetal"]]),
};

const publicRow = (over = {}) =>
  ({ id: "p1", name: "a product", metal_id: "m1", mint_id: "mi1", ...over }) as never;
const adminRow = (over = {}) =>
  ({ id: "p1", name: "a product", metal_id: "m1", mint_id: "mi1", supplier_id: "r1", ...over }) as never;

test("the storefront composition attaches two labels and drops both ids", () => {
  const [row] = storefront([publicRow()], labels);
  assert.equal(row.metal_type, "Gold");
  assert.equal(row.mint_name, "US Mint");
  assert.ok(!("metal_id" in row));
  assert.ok(!("mint_id" in row));
});

test("the admin composition attaches three labels and drops all three ids", () => {
  const [row] = admin([adminRow()], labels);
  assert.equal(row.metal, "Gold");
  assert.equal(row.mint, "US Mint");
  assert.equal(row.supplier, "Elemetal");
  for (const id of ["metal_id", "mint_id", "supplier_id"]) {
    assert.ok(!(id in row), `${id} survived composition`);
  }
});

// THE JOINS WERE INNER. A product whose metal or mint row is gone was dropped,
// and must still be - a storefront entry with no metal name renders a nameless
// product rather than not rendering at all.
test("a product with an unknown reference is dropped, not composed with nothing", () => {
  assert.deepEqual(storefront([publicRow({ metal_id: "gone" })], labels), []);
  assert.deepEqual(storefront([publicRow({ mint_id: "gone" })], labels), []);
  assert.deepEqual(admin([adminRow({ supplier_id: "gone" })], labels), []);
  // And the control: with all three present it is kept, so the three above are
  // not passing because composition never keeps anything.
  assert.equal(storefront([publicRow()], labels).length, 1);
  assert.equal(admin([adminRow()], labels).length, 1);
});
