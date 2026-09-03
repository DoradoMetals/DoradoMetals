// The parts of carrier services that need no database: the statements as text.
//
// This feature used to have the largest hand-written parameter array in the
// project - twenty-three values, feeding two statements whose column lists
// differed in three places, with `updateParams` slicing the shared array
// apart by position. CRUD-batch-3 replaced it: repo.ts's create and update
// each take a named ServiceWrite-shaped object (service.ts's toRow builds it)
// and spell their own columns, so the positional-array tests below - the ones
// that asserted `toValues`/`updateParams` agreed with the SQL on LENGTH and
// ORDER - no longer have a subject. DELETED: "the values array is the length
// both statements expect" and "updateParams drops created_by and keeps
// updated_by" (both exercised functions that are gone; the behaviour they
// protected - created_by never reassigned by an edit - is still covered by
// "the UPDATE never reassigns created_by" below and by
// tests/service.test.ts's "an update does not reassign created_by", which
// goes through Postgres).
import test from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { sqlFrom } from "#shared/db/sql.ts";
import { buildUpdate } from "#shared/db/patch.ts";
import { PATCHABLE, RETURNING } from "#db/shipping/services/repo.ts";

// sql/update.sql IS GONE. The UPDATE is built by shared/db/patch.ts from the
// column list and the RETURNING clause repo.ts exports, so what this file used
// to read out of that file it reads out of the builder's output. Same claims,
// new source of truth - and the RETURNING body is the deleted file's, moved
// verbatim, which is why the alias test below still has something to match.
const builtUpdate = () =>
  buildUpdate({
    table: "shipping.services",
    allowed: PATCHABLE,
    patch: Object.fromEntries(PATCHABLE.map((c) => [c as string, null])),
    where: { id: "x" },
    returning: RETURNING,
  })!.text;

// The statements live in db/shipping/services/sql (Phase 0c moved repo + sql
// there; this test stayed in domain/ because it also exercises service.ts),
// so this reads them from their new home rather than a sibling directory.
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

// 23 BEFORE, AND TWO OF THEM WERE created_by AND updated_by. public.audit_stamp
// writes both from the actor on the connection (migration 116), so the columns
// a caller supplies are 21 - the id plus ServiceWrite's twenty.
test("the INSERT takes the 21 values repo.ts builds, renames included", () => {
  const next = insertColumns("create");
  assert.equal(next.length, 21, "the column count changed - repo.ts builds 20 values plus the id");
  for (const name of RENAMED) {
    assert.ok(next.includes(name), `sql/create.sql no longer writes ${name}`);
  }
});

// AND IT NEVER ASSIGNS ANY OF THE SIX NOW. created_by was the one that mattered
// - an edit must not rewrite who made the row - and the trigger guarantees it
// for every table rather than one statement remembering to leave it out.
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
