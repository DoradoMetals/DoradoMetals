// The parts of carrier services that need no database: the statements as text.
//
// This feature has the largest hand-written parameter array in the project -
// twenty-three values, feeding two statements whose column lists differ in
// three places. repo.ts builds ONE array and both statements consume it, so the
// two column orders have to stay identical or a boolean lands in the wrong
// boolean and nothing complains.
import test from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { sqlFrom } from "#shared/db/sql.ts";
import { toValues } from "#features/shipping/services/service.ts";
import { updateParams } from "#features/shipping/services/repo.ts";

// features/shipping/services/sql AND legacy/shipping/services/sql - the two halves of the
// dual write, pinned against each other in one file (ruling 29 moved the
// mirror out of this feature; the pin did not follow it, because the pin IS
// the comparison between the two).
const sql = sqlFrom(path.join(import.meta.dirname, ".."));

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
  for (const n of ["get_all", "get_one", "get_by_carrier", "create", "update", "delete"]) {
    assert.ok(sql(n).trim().length > 0, `${n} is empty`);
  }
});

// The three renamed columns: the table's own spellings on the left, the
// WIRE's (exchange-era) spellings on the right. The dual write died with
// D212; the wire aliases live on, because a wire shape never moves during a
// schema migration.
const RENAMES: Record<string, string> = {
  supports_pickups: "supports_pickup",
  supports_dropoffs: "supports_dropoff",
  max_weight_lb: "max_weight_lbs",
};
const RENAMED = Object.keys(RENAMES);

test("the INSERT takes the 23 values repo.ts builds, renames included", () => {
  const next = insertColumns("create");
  assert.equal(next.length, 23, "the column count changed - repo.ts builds 22 values plus the id");
  for (const name of RENAMED) {
    assert.ok(next.includes(name), `sql/create.sql no longer writes ${name}`);
  }
});

test("the UPDATE never reassigns created_by", () => {
  const next = updateColumns("update").filter((c) => c !== "updated_at");
  assert.ok(!next.includes("created_by"), "the update reassigns created_by");
});

// The bridge between the array and the statements. toValues produces the
// INSERT's values after the id; updateParams reorders them for the UPDATE.
// Asserting the LENGTHS against the SQL is what catches a column added to one
// statement and not to the array.
test("the values array is the length both statements expect", () => {
  const values = toValues({});
  assert.equal(values.length, insertColumns("create").length - 1,
    "toValues and sql/create.sql disagree about how many values there are");

  const params = updateParams("an-id", values);
  const highest = Math.max(
    ...[...body("update").matchAll(/\$(\d+)/g)].map(([, n]) => Number(n))
  );
  assert.equal(params.length, highest,
    "updateParams and sql/update.sql disagree about how many parameters there are");
  assert.equal(params[params.length - 1], "an-id", "the id is not the last parameter");
});

// created_by is dropped by updateParams and updated_by is kept. Getting this
// backwards would rewrite who created every row on every edit, which is the
// kind of thing nobody looks at until they need it.
test("updateParams drops created_by and keeps updated_by", () => {
  const values = toValues({ created_by: "the creator", updated_by: "the editor" });
  const params = updateParams("an-id", values);
  assert.ok(!params.includes("the creator"), "created_by survived into the update");
  assert.ok(params.includes("the editor"), "updated_by was dropped from the update");
});

// created_by_id and updated_by_id exist only in the new schema. Projecting one
// would put a field on the wire that exchange cannot produce.
test("no read projects a column exchange has no equivalent for", () => {
  for (const n of ["get_all", "get_one", "get_by_carrier", "create", "update"]) {
    for (const col of ["created_by_id", "updated_by_id"]) {
      assert.doesNotMatch(body(n), new RegExp(`\\b${col}\\b`), `${n} projects ${col}`);
    }
  }
});

// Every read has to alias the three renamed columns back, or the frontend gets
// a field it does not read and loses one it does.
test("every read aliases the renamed columns back to the names the wire uses", () => {
  assert.ok(Object.keys(RENAMES).length, "RENAMES is empty, so this test asserts nothing");
  for (const n of ["get_all", "get_one", "get_by_carrier", "create", "update"]) {
    for (const [newName, oldName] of Object.entries(RENAMES)) {
      assert.match(
        body(n), new RegExp(`${newName}\\s+AS\\s+${oldName}`, "i"),
        `${n} does not alias ${newName} back to ${oldName}`
      );
    }
  }
});

// One table per repo.
test("no statement reaches into a second table", () => {
  for (const n of ["get_all", "get_one", "get_by_carrier", "create", "update", "delete"]) {
    assert.doesNotMatch(body(n), /exchange\./, `${n} reaches into exchange`);
  }
});
