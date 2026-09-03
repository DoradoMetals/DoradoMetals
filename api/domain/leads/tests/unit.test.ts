// The parts of leads that need no database: the wire conversion and the statements as text - moving SQL into .sql files means a typo is no longer a TypeScript syntax error.
import { test } from "vitest";
import assert from "node:assert/strict";
import path from "node:path";
import { sqlFrom } from "#shared/db/sql.ts";
import { buildUpdate } from "#shared/db/patch.ts";
import { PATCHABLE } from "#db/leads/repo.ts";

// sql/update.sql is gone: the one UPDATE is built by shared/db/patch.ts from the column list repo.ts exports, so claims about it are made about the builder's output instead.
const builtUpdate = (patch: Record<string, unknown> = { notes: "n" }) =>
  buildUpdate({ table: "leads.leads", allowed: PATCHABLE, patch, where: { id: "x" } })!;

const sql = sqlFrom(path.join(import.meta.dirname, "..", "..", "..", "db", "leads"));

// Comments stripped before any assertion: a check that reads a comment as code (e.g. matching created_by_id in a comment explaining its absence) reports the opposite of the truth.
const body = (name: string): string =>
  sql(name)
    .split("\n")
    .filter((line) => !line.trim().startsWith("--"))
    .join("\n");

// A missing or empty .sql file throws only when the query runs, which for a rarely-used path could be in production. This walks all of them at build time instead.
test("every statement this feature uses loads and is not empty", () => {
  for (const name of ["get_one", "get_all", "create", "delete"]) {
    const text = sql(name);
    assert.ok(text.trim().length > 0, `${name} is empty`);
  }
  assert.ok(builtUpdate().text.trim().length > 0, "the built UPDATE is empty");
});

// No statement writes an audit column: public.audit_stamp writes them all from the actor on the connection now, and a second writer would be a silent fight over the same column.
test("no statement writes an audit column", () => {
  const insert = body("create").split("RETURNING")[0];
  const sets = builtUpdate(Object.fromEntries(PATCHABLE.map((c) => [c, null])))
    .text.split(" WHERE")[0];
  for (const col of ["created_by", "updated_by", "created_at", "updated_at"]) {
    assert.doesNotMatch(insert, new RegExp(`\\b${col}\\b`), `create.sql writes ${col}`);
    assert.doesNotMatch(sets, new RegExp(`\\b${col}\\b`), `the built UPDATE writes ${col}`);
  }
});

// created_by_id and updated_by_id exist only on leads.leads and must never reach the wire.
test("no read projects the columns exchange has no equivalent for", () => {
  for (const name of ["get_one", "get_all", "create"]) {
    const text = body(name);
    assert.doesNotMatch(text, /\bcreated_by_id\b/, `${name} projects created_by_id`);
    assert.doesNotMatch(text, /\bupdated_by_id\b/, `${name} projects updated_by_id`);
  }
});

// A read with a non-unique ORDER BY returns physical order, which changes as rows are updated. get_all breaks the tie on id.
test("the list read is deterministically ordered", () => {
  assert.match(body("get_all"), /ORDER BY\s+created_at DESC,\s*id DESC/i);
});

// The repo owns one table; a join here would put a second table's shape into a row type that claims to be leads.leads.
test("no statement in this feature joins another table", () => {
  for (const name of ["get_one", "get_all", "create", "delete"]) {
    assert.doesNotMatch(body(name), /\bJOIN\b/i, `${name} joins another table`);
  }
  assert.doesNotMatch(builtUpdate().text, /\bJOIN\b/i, "the built UPDATE joins another table");
});

// Every statement targets leads.leads and nothing else.
test("each statement targets the schema its file name claims", () => {
  for (const name of ["get_one", "get_all", "create", "delete"]) {
    assert.match(body(name), /leads\.leads/, `${name} does not target leads.leads`);
    assert.doesNotMatch(body(name), /exchange\./, `${name} touches exchange`);
  }
  assert.match(builtUpdate().text, /leads\.leads/);
  assert.doesNotMatch(builtUpdate().text, /exchange\./);
});
