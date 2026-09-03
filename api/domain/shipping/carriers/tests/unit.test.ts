// The parts of carriers that need no database: the statements as text.
// repo.ts builds its parameter array by hand against generated SQL - the one transcription error the generator can't catch, so these check column order and names directly.
import { test } from "vitest";
import assert from "node:assert/strict";
import path from "node:path";
import { sqlFrom } from "#shared/db/sql.ts";

const sql = sqlFrom(path.join(import.meta.dirname, "..", "..", "..", "..", "db", "shipping", "carriers"));

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

// `is_active` was exchange's name for this column (now `enabled`) - using it here is a runtime column-not-found, not a compile error.
test("the statements speak the table's own column names", () => {
  for (const n of ["get_all", "get_one", "create", "update"]) {
    assert.doesNotMatch(body(n), /\bis_active\b/, `${n} uses exchange's column name`);
  }
});

// organization_id isn't on the wire, but compose.ts needs it to find the organization half - every read must project it, or the carrier list would quietly come back empty.
test("every read projects organization_id for compose.ts", () => {
  for (const n of ["get_all", "get_one", "create", "update"]) {
    assert.match(body(n), /\borganization_id\b/, `${n} does not project organization_id`);
  }
});

// One table per repo: shipping.carriers only - no reach into exchange or into organizations.organizations, which has its own writing service.
test("no statement reaches into a second table", () => {
  for (const n of ["get_all", "get_one", "create", "update", "delete"]) {
    assert.doesNotMatch(body(n), /organizations\.organizations/, `${n} joins organizations`);
    assert.doesNotMatch(body(n), /exchange\./, `${n} reaches into exchange`);
  }
});
