// The statements, as text - hand-written parameter arrays against generated SQL are the one transcription error the generator cannot prevent (see reviews/tests/unit.test.ts).
import test from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { sqlFrom } from "#shared/db/sql.ts";

const sql = sqlFrom(path.join(import.meta.dirname, "..", "..", "..", "..", "db", "media", "images"));
const body = (n: string) => sql(n).split("\n").filter((l) => !l.trim().startsWith("--")).join("\n");

test("every statement loads and is not empty", () => {
  for (const n of ["get_one", "get_all", "by_user", "create", "delete"]) {
    assert.ok(sql(n).trim().length > 0, `${n} is empty`);
  }
});

test("create writes its columns in the order repo.ts supplies them", () => {
  assert.match(
    body("create"),
    /\(id,\s*user_id,\s*bucket,\s*path,\s*filename,\s*mime_type,\s*size_bytes\)/,
    "sql/create.sql column order changed - repo.ts builds its params to match"
  );
});

// The upsert is the whole write design - a retried upload of the same object must update the existing row rather than create a second.
test("create upserts on the object's identity and returns the id", () => {
  assert.match(body("create"), /ON CONFLICT\s*\(path,\s*filename,\s*user_id\)\s*DO UPDATE/i);
  assert.match(body("create"), /RETURNING[\s\S]*\bid\b/i);
});

// The delete is scoped to the owner - that clause is what makes the ownership check unbypassable from any future caller.
test("the delete is scoped to the owner", () => {
  assert.match(body("delete"), /WHERE id = \$1 AND user_id = \$2/i, "delete is not owner-scoped");
});

test("both list reads are deterministically ordered", () => {
  for (const n of ["get_all", "by_user"]) {
    assert.match(body(n), /ORDER BY\s+created_at DESC,\s*id DESC/i, `${n} is unordered`);
  }
});

// checksum is the column's own name; every read projects it to the wire.
test("checksum is projected", () => {
  for (const n of ["get_one", "get_all", "by_user", "create"]) {
    assert.match(body(n), /\bchecksum\b/, `${n} does not project checksum`);
  }
});

test("each statement targets the schema its file name claims", () => {
  for (const n of ["get_one", "get_all", "by_user", "create", "delete"]) {
    assert.match(body(n), /media\.images/, `${n} does not target media.images`);
    assert.doesNotMatch(body(n), /exchange\./, `${n} touches exchange`);
  }
});

test("no statement joins another table", () => {
  for (const n of ["get_one", "get_all", "by_user", "create", "delete"]) {
    assert.doesNotMatch(body(n), /\bJOIN\b/i, `${n} joins another table`);
  }
});
