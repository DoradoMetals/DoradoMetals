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

test("the statements speak the table's own column names", () => {
  for (const n of ["get_all", "get_one", "create", "update"]) {
    assert.doesNotMatch(body(n), /\bis_active\b/, `${n} uses exchange's column name`);
  }
});

test("every read projects organization_id for compose.ts", () => {
  for (const n of ["get_all", "get_one", "create", "update"]) {
    assert.match(body(n), /\borganization_id\b/, `${n} does not project organization_id`);
  }
});

test("no statement reaches into a second table", () => {
  for (const n of ["get_all", "get_one", "create", "update", "delete"]) {
    assert.doesNotMatch(body(n), /organizations\.organizations/, `${n} joins organizations`);
    assert.doesNotMatch(body(n), /exchange\./, `${n} reaches into exchange`);
  }
});
