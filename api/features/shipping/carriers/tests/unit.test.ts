// The parts of carriers that need no database: the statements as text.
//
// repo.ts and legacy.repo.ts build their parameter arrays by hand against
// generated SQL, which is the one transcription error the generator cannot
// prevent. exchange.carriers takes SIX values in an order that has nothing to
// do with the new schema's, so a reordered column list here would write a phone
// number into the logo column and read back clean.
import test from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { sqlFrom } from "#shared/db/sql.ts";

// features/shipping/carriers/sql AND legacy/shipping/carriers/sql - the two halves of the
// dual write, pinned against each other in one file (ruling 29 moved the
// mirror out of this feature; the pin did not follow it, because the pin IS
// the comparison between the two).
const sql = sqlFrom(path.join(import.meta.dirname, ".."));

const body = (name: string): string =>
  sql(name).split("\n").filter((l) => !l.trim().startsWith("--")).join("\n");

test("every statement loads and is not empty", () => {
  for (const n of ["get_all", "get_one", "create", "update", "delete"]) {
    assert.ok(sql(n).trim().length > 0, `${n} is empty`);
  }
});

test("create writes its columns in the order repo.ts supplies them", () => {
  assert.match(
    body("create"),
    /\(id,\s*organization_id,\s*logo\)/,
    "sql/create.sql column order changed - repo.ts builds its params to match"
  );
});

// `enabled` is the table's name; `is_active` was exchange's, and a statement
// using it against shipping.carriers is a column-does-not-exist error at
// runtime, not at compile time.
test("the statements speak the table's own column names", () => {
  for (const n of ["get_all", "get_one", "create", "update"]) {
    assert.doesNotMatch(body(n), /\bis_active\b/, `${n} uses exchange's column name`);
  }
});

// organization_id is NOT on the wire - the adapter drops it - but compose.ts
// needs it to find the organization half, so every read must project it.
// A read that stopped would return a carrier list of length zero, quietly.
test("every read projects organization_id for compose.ts", () => {
  for (const n of ["get_all", "get_one", "create", "update"]) {
    assert.match(body(n), /\borganization_id\b/, `${n} does not project organization_id`);
  }
});

// One table per repo. shipping.carriers here, exchange.carriers there, and
// neither touches organizations.organizations - that table has one writing
// service and this is not it.
test("no statement reaches into a second table", () => {
  for (const n of ["get_all", "get_one", "create", "update", "delete"]) {
    assert.doesNotMatch(body(n), /organizations\.organizations/, `${n} joins organizations`);
    assert.doesNotMatch(body(n), /exchange\./, `${n} reaches into exchange`);
  }
});
