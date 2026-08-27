// The statements, as text. See features/reviews/tests/unit.test.ts for why this
// matters more than it looks: hand-written parameter arrays against generated
// SQL are the one transcription error the generator cannot prevent.
import test from "node:test";
import assert from "node:assert/strict";
import { sqlFrom } from "#shared/db/sql.ts";

const sql = sqlFrom(new URL(".", import.meta.url).pathname.replace(/\/tests\/$/, ""));
const body = (n: string) => sql(n).split("\n").filter((l) => !l.trim().startsWith("--")).join("\n");

test("every statement loads and is not empty", () => {
  for (const n of ["get_one", "get_all", "by_user", "create", "delete",
                   "legacy/create", "legacy/delete"]) {
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

// THE UPSERT IS THE WHOLE WRITE DESIGN. A retried upload of the same object
// must update the existing row rather than create a second, and RETURNING is
// what lets the legacy write agree on the id without reading exchange back.
test("create upserts on the object's identity and returns the id", () => {
  assert.match(body("create"), /ON CONFLICT\s*\(path,\s*filename,\s*user_id\)\s*DO UPDATE/i);
  assert.match(body("create"), /RETURNING[\s\S]*\bid\b/i);
});

// Both deletes are scoped to the owner. That clause is not redundant with the
// service's ownership check - it is what makes the check unbypassable from any
// future caller.
test("both deletes are scoped to the owner", () => {
  for (const n of ["delete", "legacy/delete"]) {
    assert.match(body(n), /WHERE id = \$1 AND user_id = \$2/i, `${n} is not owner-scoped`);
  }
});

// The implementation this replaces had NO ORDER BY on the admin list at all.
test("both list reads are deterministically ordered", () => {
  for (const n of ["get_all", "by_user"]) {
    assert.match(body(n), /ORDER BY\s+created_at DESC,\s*id DESC/i, `${n} is unordered`);
  }
});

// `checksum` is a RENAME of exchange's checksum_sha256, not a new column, so it
// IS projected and wire.ts renames it at the edge under MEDIA_WIRE.
test("checksum is projected, and the legacy writes do not mention either name", () => {
  for (const n of ["get_one", "get_all", "by_user", "create"]) {
    assert.match(body(n), /\bchecksum\b/, `${n} does not project checksum`);
  }
  for (const n of ["legacy/create", "legacy/delete"]) {
    assert.doesNotMatch(body(n), /checksum/, `${n} writes a checksum it should not`);
  }
});

test("each statement targets the schema its file name claims", () => {
  for (const n of ["get_one", "get_all", "by_user", "create", "delete"]) {
    assert.match(body(n), /media\.images/, `${n} does not target media.images`);
    assert.doesNotMatch(body(n), /exchange\./, `${n} touches exchange`);
  }
  for (const n of ["legacy/create", "legacy/delete"]) {
    assert.match(body(n), /exchange\.images/, `${n} does not target exchange.images`);
    assert.doesNotMatch(body(n), /media\.images/, `${n} touches media.images`);
  }
});

test("no statement joins another table", () => {
  for (const n of ["get_one", "get_all", "by_user", "create", "delete"]) {
    assert.doesNotMatch(body(n), /\bJOIN\b/i, `${n} joins another table`);
  }
});
