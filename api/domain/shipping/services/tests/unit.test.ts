// The parts of carrier services that need no database: the statements as text.
import test from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { sqlFrom } from "#shared/db/sql.ts";
import { buildUpdate } from "#shared/db/patch.ts";
import { PATCHABLE, RETURNING } from "#db/shipping/services/repo.ts";

// The UPDATE is built by shared/db/patch.ts from repo.ts's column list and RETURNING clause - this reads the builder's output as the source of truth.
const builtUpdate = () =>
  buildUpdate({
    table: "shipping.services",
    allowed: PATCHABLE,
    patch: Object.fromEntries(PATCHABLE.map((c) => [c as string, null])),
    where: { id: "x" },
    returning: RETURNING,
  })!.text;

// The statements live in db/shipping/services/sql; this test stays in domain/ because it also exercises service.ts.
const sql = sqlFrom(path.join(import.meta.dirname, "..", "..", "..", "..", "db", "shipping", "services"));

const body = (name: string): string =>
  sql(name).split("\n").filter((l) => !l.trim().startsWith("--")).join("\n");

// The column list of an INSERT, in order.
const insertColumns = (name: string): string[] => {
  const m = body(name).match(/\(([^)]*)\)\s*\nVALUES/);
  assert.ok(m, `${name} has no INSERT column list`);
  return m[1].split(",").map((c) => c.trim()).filter(Boolean);
};

// The SET assignments of an UPDATE, ordered by parameter number.
const updateColumns = (name: string): string[] =>
  [...body(name).matchAll(/(\w+)\s*=\s*\$(\d+)/g)]
    .sort((a, b) => Number(a[2]) - Number(b[2]))
    .map(([, col]) => col);

test("every statement loads and is not empty", () => {
  for (const n of ["get_all", "get_one", "get_by_carrier", "create", "delete"]) {
    assert.ok(sql(n).trim().length > 0, `${n} is empty`);
  }
  assert.ok(builtUpdate().trim().length > 0, "the built UPDATE is empty");
});

// The three renamed columns: the table's own spelling on the left, the wire's on the right - a wire shape never moves during a schema migration.
const RENAMES: Record<string, string> = {
  supports_pickups: "supports_pickup",
  supports_dropoffs: "supports_dropoff",
  max_weight_lb: "max_weight_lbs",
};
const RENAMED = Object.keys(RENAMES);

// 21 = id plus ServiceWrite's twenty columns; created_by/updated_by aren't among them - audit_stamp writes those.
test("the INSERT takes the 21 values repo.ts builds, renames included", () => {
  const next = insertColumns("create");
  assert.equal(next.length, 21, "the column count changed - repo.ts builds 20 values plus the id");
  for (const name of RENAMED) {
    assert.ok(next.includes(name), `sql/create.sql no longer writes ${name}`);
  }
});

// created_by is the one that matters - an edit must not rewrite who made the row - and the trigger guarantees it for every table, not one statement remembering to.
test("the UPDATE never reassigns created_by, or any other audit column", () => {
  const sets = builtUpdate().split(" WHERE")[0];
  for (const col of ["created_by", "created_by_id", "created_at",
                     "updated_by", "updated_by_id", "updated_at"]) {
    assert.doesNotMatch(sets, new RegExp(`\\b${col}\\b = `), `the update assigns ${col}`);
  }
  assert.doesNotMatch(
    insertColumns("create").join(","), /created_by|updated_by/,
    "sql/create.sql still names an author - the trigger owns it"
  );
});

// created_by_id and updated_by_id exist only in the new schema. Projecting one
// would put a field on the wire that exchange cannot produce.
test("no read projects a column exchange has no equivalent for", () => {
  for (const [n, text] of [
    ...["get_all", "get_one", "get_by_carrier", "create"].map((n) => [n, body(n)] as const),
    ["update", builtUpdate()] as const,
  ]) {
    for (const col of ["created_by_id", "updated_by_id"]) {
      assert.doesNotMatch(text, new RegExp(`\\b${col}\\b`), `${n} projects ${col}`);
    }
  }
});

// Every read has to alias the three renamed columns back, or the frontend gets
// a field it does not read and loses one it does.
test("every read aliases the renamed columns back to the names the wire uses", () => {
  assert.ok(Object.keys(RENAMES).length, "RENAMES is empty, so this test asserts nothing");
  for (const [n, text] of [
    ...["get_all", "get_one", "get_by_carrier", "create"].map((n) => [n, body(n)] as const),
    ["update", builtUpdate()] as const,
  ]) {
    for (const [newName, oldName] of Object.entries(RENAMES)) {
      assert.match(
        text, new RegExp(`${newName}\\s+AS\\s+${oldName}`, "i"),
        `${n} does not alias ${newName} back to ${oldName}`
      );
    }
  }
});

// One table per repo.
test("no statement reaches into a second table", () => {
  for (const n of ["get_all", "get_one", "get_by_carrier", "create", "delete"]) {
    assert.doesNotMatch(body(n), /exchange\./, `${n} reaches into exchange`);
  }
  assert.doesNotMatch(builtUpdate(), /exchange\./, "the built UPDATE reaches into exchange");
});
