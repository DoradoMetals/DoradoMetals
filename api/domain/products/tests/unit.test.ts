// The parts of products that need no database: the write statements as text,
// and the in-memory join that replaced three SQL ones.
//
// The projections have their own file - tests/constants.test.js - because they
// are also compared against the exchange field lists that checkout still uses.
import test from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { sqlFrom } from "#shared/db/sql.ts";
import { buildUpdate } from "#shared/db/patch.ts";
import { PATCHABLE } from "#db/products/repo.ts";
import { storefront, admin } from "#domain/products/compose.ts";
import type { Labels } from "#domain/products/compose.ts";

// features/products/sql - the statements as text.
const sql = sqlFrom(path.join(import.meta.dirname, "..", "..", "..", "db", "products"));

const body = (name: string): string =>
  sql(name).split("\n").filter((l) => !l.trim().startsWith("--")).join("\n");

// The SET assignments, ordered by parameter number. The WHERE key is dropped:
// sql/update.sql IS GONE. The one UPDATE is built by shared/db/patch.ts from
// the column list repo.ts exports, so everything this file used to assert
// about the statement's text is asserted about the builder's output instead -
// the same claims, read from where the statement is now made.
//
// The WHERE binds `id` and matches the same pattern as an assignment, so only
// the SET list is scanned.
const builtUpdate = (patch: Record<string, unknown>) =>
  buildUpdate({
    table: "products.bullion", allowed: PATCHABLE, patch, where: { id: "x" },
  })!;

const updateColumns = (patch: Record<string, unknown>): string[] =>
  [...builtUpdate(patch).text.split(" WHERE")[0].matchAll(/(\w+) = \$\d+/g)]
    .map(([, col]) => col);

// What the admin form sends back: every patchable column, present.
const fullPatch: Record<string, unknown> =
  Object.fromEntries(PATCHABLE.map((c) => [c as string, null]));

test("every statement loads and is not empty", () => {
  for (const n of [
    "get_storefront", "get_sell", "get_homepage", "get_by_slug", "get_by_ids",
    "get_filtered", "get_admin_all", "get_admin_one", "get_liveness",
    "get_types", "create",
  ]) {
    assert.ok(sql(n).trim().length > 0, `${n} is empty`);
  }
});

// THE THREE RENAMES exchange used to carry (product_name and friends); the
// table's own spellings are what the statement must keep writing.
const RENAMES: Record<string, string> = {
  name: "product_name",
  description: "product_description",
  type: "product_type",
};

test("the UPDATE assigns the 26 values ProductPatch carries, in order", () => {
  const next = updateColumns(fullPatch);
  // 27 before, and the twenty-seventh was updated_by - the audit column the
  // statement wrote from an `actor` argument. public.audit_stamp writes it now
  // (migration 116), so the form's own columns are 26.
  assert.equal(next.length, 26, "the update column count changed - ProductPatch has 26 entries");
  assert.deepEqual(next, PATCHABLE.map(String), "the SET list no longer follows repo.ts's PATCHABLE");
  // The three renamed columns write under the table's own names.
  for (const newName of Object.keys(RENAMES)) {
    assert.ok(next.includes(newName), `the built UPDATE no longer writes ${newName}`);
  }
});

// updated_at USED TO BE ASSERTED PRESENT HERE and is now asserted ABSENT. The
// statement kept it fresh with `updated_at = NOW()`; the trigger does it, and
// a second writer is a fight over one column. Same claim - the row records
// when it changed - moved to the mechanism that keeps it true for every table.
test("the update writes no audit column at all", () => {
  const sets = builtUpdate(fullPatch).text.split(" WHERE")[0];
  for (const col of ["updated_at", "updated_by", "updated_by_id", "created_at", "created_by"]) {
    assert.doesNotMatch(sets, new RegExp(`\\b${col}\\b`), `the built UPDATE writes ${col}`);
  }
  assert.doesNotMatch(
    body("create").split("RETURNING")[0], /\bcreated_by\b|\bupdated_by\b/,
    "sql/create.sql still writes an author - the trigger owns it"
  );
});

// The reference columns are IDS in the statement. The implementation this
// replaces resolved NAMES with three scalar subqueries inside the UPDATE, so a
// name matching nothing became NULL and failed on a NOT NULL column without
// saying which of the three was wrong.
test("the update takes ids, not names resolved by a subquery", () => {
  const text = builtUpdate(fullPatch).text;
  for (const table of ["metals.metals", "products.mints", "refiners."]) {
    assert.ok(!text.includes(table), `the built UPDATE still reaches into ${table}`);
  }
  assert.doesNotMatch(text, /SELECT/i, "the built UPDATE contains a subquery");
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

test("no statement reaches into exchange", () => {
  for (const n of ["get_storefront", "get_sell", "get_homepage", "get_by_slug",
                   "get_by_ids", "get_filtered", "get_admin_all", "get_admin_one",
                   "get_liveness", "get_types", "create"]) {
    assert.doesNotMatch(body(n), /exchange\./, `${n} reaches into exchange`);
  }
  assert.doesNotMatch(builtUpdate(fullPatch).text, /exchange\./);
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
