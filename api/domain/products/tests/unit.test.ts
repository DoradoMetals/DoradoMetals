// The parts of products that need no database: the write statements as text, and the in-memory join that replaced three SQL ones.
// Projections have their own file (tests/constants.test.ts) since they're also compared against the exchange field lists checkout still uses.
import { test } from "vitest";
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

// The SET assignments, ordered by parameter number — sql/update.sql is gone; the one UPDATE is built by shared/db/patch.ts from repo.ts's column list, so the same claims are asserted against the builder's output instead.
// The WHERE binds `id` and matches the same pattern as an assignment, so only the SET list is scanned.
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

// The three renames exchange used to carry (product_name and friends); the table's own spellings are what the statement must keep writing.
const RENAMES: Record<string, string> = {
  name: "product_name",
  description: "product_description",
  type: "product_type",
};

test("the UPDATE assigns the 25 values ProductPatch carries, in order", () => {
  const next = updateColumns(fullPatch);
  // 27 before migration 116 (updated_by moved to the audit_stamp trigger,
  // leaving 26); 25 since migration 119 dropped sell_display (ruling 49).
  assert.equal(next.length, 25, "the update column count changed - ProductPatch has 25 entries");
  assert.deepEqual(next, PATCHABLE.map(String), "the SET list no longer follows repo.ts's PATCHABLE");
  // The three renamed columns write under the table's own names.
  for (const newName of Object.keys(RENAMES)) {
    assert.ok(next.includes(newName), `the built UPDATE no longer writes ${newName}`);
  }
});

// updated_at used to be asserted present here, now asserted ABSENT: the trigger keeps it fresh now, and a second writer would be a fight over one column.
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

// The reference columns are IDS in the statement — resolving NAMES via scalar subqueries let an unmatched name become NULL and fail on a NOT NULL column without saying which was wrong.
test("the update takes ids, not names resolved by a subquery", () => {
  const text = builtUpdate(fullPatch).text;
  for (const table of ["metals.metals", "products.mints", "refiners."]) {
    assert.ok(!text.includes(table), `the built UPDATE still reaches into ${table}`);
  }
  assert.doesNotMatch(text, /SELECT/i, "the built UPDATE contains a subquery");
});

// The seven columns exchange defaults and products.bullion does not — if create ever stops naming one, the insert raises 23502.
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

// One join, not three — a statement that grew one back would work while quietly reintroducing the per-query cost the composition removed.
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

// The joins were inner: a product with a gone metal/mint/supplier is dropped, not composed with a nameless entry.
test("a product with an unknown reference is dropped, not composed with nothing", () => {
  assert.deepEqual(storefront([publicRow({ metal_id: "gone" })], labels), []);
  assert.deepEqual(storefront([publicRow({ mint_id: "gone" })], labels), []);
  assert.deepEqual(admin([adminRow({ supplier_id: "gone" })], labels), []);
  // And the control: with all three present it is kept, so the three above are
  // not passing because composition never keeps anything.
  assert.equal(storefront([publicRow()], labels).length, 1);
  assert.equal(admin([adminRow()], labels).length, 1);
});
