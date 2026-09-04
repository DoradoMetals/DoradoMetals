// The parts of products that need no database: the statements as text, the
// UPDATE the shared patch builder produces, and the grouping that moved out of
// the browser.
import { test } from "vitest";
import assert from "node:assert/strict";
import path from "node:path";
import { sqlFrom } from "#shared/db/sql.ts";
import { buildUpdate } from "#shared/db/patch.ts";
import { PATCHABLE } from "#db/products/repo.ts";
import { group } from "#domain/products/rules.ts";
import { BullionPatch, type BullionStorefront } from "@dorado/contracts";

const sql = sqlFrom(path.join(import.meta.dirname, "..", "..", "..", "db", "products"));

const body = (name: string): string =>
  sql(name).split("\n").filter((l) => !l.trim().startsWith("--")).join("\n");

const STATEMENTS = ["list", "get_admin", "get_liveness", "get_types", "create"];

const builtUpdate = (patch: Record<string, unknown>) =>
  buildUpdate({
    table: "products.bullion", allowed: PATCHABLE, patch, where: { id: "x" },
  })!;

const updateColumns = (patch: Record<string, unknown>): string[] =>
  [...builtUpdate(patch).text.split(" WHERE")[0].matchAll(/(\w+) = \$\d+/g)]
    .map(([, col]) => col);

const fullPatch: Record<string, unknown> =
  Object.fromEntries(PATCHABLE.map((c) => [c as string, null]));

test("every statement loads and is not empty", () => {
  for (const n of STATEMENTS) assert.ok(sql(n).trim().length > 0, `${n} is empty`);
});

// RULING 64: the writable set is the contract's, never a second list here.
test("the patchable columns are BullionPatch minus its id", () => {
  const declared = Object.keys(BullionPatch.shape).filter((k) => k !== "id");
  assert.deepEqual([...PATCHABLE].sort(), declared.sort());
  assert.ok(!(PATCHABLE as string[]).includes("id"),
    "id is the UPDATE's WHERE key, not a value it writes");
  assert.deepEqual(updateColumns(fullPatch), PATCHABLE.map(String));
});

// updated_at is asserted ABSENT: the trigger keeps it fresh, and a second
// writer would be a fight over one column.
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

// The reference columns are IDS in the statement - resolving NAMES through
// scalar subqueries let an unmatched name become NULL and fail on a NOT NULL
// column without saying which was wrong.
test("the update takes ids, not names resolved by a subquery", () => {
  const text = builtUpdate(fullPatch).text;
  for (const table of ["metals.metals", "products.mints", "refiners."]) {
    assert.ok(!text.includes(table), `the built UPDATE still reaches into ${table}`);
  }
  assert.doesNotMatch(text, /SELECT/i, "the built UPDATE contains a subquery");
});

test("create names every column bullion declares NOT NULL without a default", () => {
  for (const col of [
    "metal_id", "mint_id", "supplier_id", "image_front", "image_back", "stock", "quantity",
  ]) {
    assert.match(body("create"), new RegExp(`\\b${col}\\b`),
      `sql/create.sql does not supply ${col}, which products.bullion requires`);
  }
});

test("no statement reaches into exchange", () => {
  for (const n of STATEMENTS) {
    assert.doesNotMatch(body(n), /exchange\./, `${n} reaches into exchange`);
  }
  assert.doesNotMatch(builtUpdate(fullPatch).text, /exchange\./);
});

// The public statement must not project an admin fact. `display` is the one
// that matters: it is the buy gate, and it has its own read.
test("the public statement projects no admin column", () => {
  const projection = body("list").split("FROM")[0];
  for (const col of [
    "display", "stock", "quantity", "filter_category", "created_by", "updated_by",
    "created_at", "updated_at", "supplier_id",
  ]) {
    assert.doesNotMatch(projection, new RegExp(`\\b${col}\\b`),
      `sql/list.sql projects ${col}, which anyone on the internet would then read`);
  }
});

// The public read must stay gate-able rather than gated: the sell side has no
// gate at all (ruling 49), so `display` is a filter the caller passes.
test("the public statement carries no WHERE of its own", () => {
  assert.match(body("list"), /WHERE __PREDICATE__/);
  assert.match(body("get_admin"), /WHERE __PREDICATE__/);
});

// -------------------------------------------------------------- the grouping

const aRow = (over: Partial<BullionStorefront>): BullionStorefront =>
  ({ id: "p", name: "n", variant_group: "", content: 1, ...over }) as BullionStorefront;

test("a product with no family is its own group and carries no variants", () => {
  const groups = group([aRow({ id: "a" }), aRow({ id: "b" })]);
  assert.equal(groups.length, 2);
  assert.deepEqual(groups.map((g) => g.default.id), ["a", "b"]);
  for (const g of groups) assert.deepEqual(g.variants, []);
});

test("a family's headline row is its heaviest, and the siblings follow it", () => {
  const [g] = group([
    aRow({ id: "half", variant_group: "eagle", content: 0.5 }),
    aRow({ id: "tenth", variant_group: "eagle", content: 0.1 }),
    aRow({ id: "whole", variant_group: "eagle", content: 1 }),
  ]);
  assert.equal(g.default.id, "whole");
  assert.deepEqual(g.variants.map((v) => v.id), ["whole", "half", "tenth"]);
});

test("a family of one carries no variants either", () => {
  const [g] = group([aRow({ id: "lonely", variant_group: "eagle" })]);
  assert.equal(g.default.id, "lonely");
  assert.deepEqual(g.variants, []);
});

// The group order is the order the rows arrived in, which is the sort the
// caller asked the database for - not families-after-singles, which is what
// the browser's version did and what silently overrode every sort.
test("group order follows row order", () => {
  const groups = group([
    aRow({ id: "single-1" }),
    aRow({ id: "fam-a", variant_group: "f", content: 1 }),
    aRow({ id: "single-2" }),
    aRow({ id: "fam-b", variant_group: "f", content: 2 }),
  ]);
  assert.deepEqual(groups.map((g) => g.default.id), ["single-1", "fam-b", "single-2"]);
});
