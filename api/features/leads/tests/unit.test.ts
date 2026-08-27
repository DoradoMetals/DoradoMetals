// The parts of leads that need no database.
//
// Small on purpose: in this structure almost nothing is unit-testable, because
// almost nothing is logic. The repo is SQL, the controller is status codes, and
// the service is orchestration. What IS here is the wire conversion and the
// statements themselves - and the statements are worth checking as text,
// because moving SQL into .sql files means a typo is no longer a syntax error
// in TypeScript.
import test from "node:test";
import assert from "node:assert/strict";
import { sqlFrom } from "#shared/db/sql.ts";
import { toWire, listToWire } from "#features/leads/wire.ts";

const sql = sqlFrom(new URL(".", import.meta.url).pathname.replace(/\/tests\/$/, ""));

// COMMENTS STRIPPED BEFORE ANY ASSERTION ABOUT THE STATEMENT. The first version
// of the projection test below failed on get_one.sql - not because the query
// selects created_by_id, but because the COMMENT above it explains why it does
// not. A check that reads a comment as code reports the opposite of the truth.
const body = (name: string): string =>
  sql(name)
    .split("\n")
    .filter((line) => !line.trim().startsWith("--"))
    .join("\n");

const ROW = {
  id: "11111111-1111-1111-1111-111111111111",
  name: "A Name", phone: "5551234567", email: "a@example.invalid",
  created_at: new Date(0), updated_at: new Date(0), last_contacted: null,
  converted: false, contacted: false, responded: false,
  created_by: "someone", updated_by: "someone", notes: null,
  contact: null, priority: "Medium",
} as never;

test("the wire conversion is an identity for leads, and says so", () => {
  assert.deepEqual(toWire(ROW), ROW);
  assert.deepEqual(listToWire([ROW, ROW]), [ROW, ROW]);
});

// EVERY STATEMENT IS LOADED. A .sql file that does not exist, or that is empty,
// throws only when the query runs - which for a rarely-used path could be in
// production. This walks all of them at build time instead.
test("every statement this feature uses loads and is not empty", () => {
  for (const name of [
    "get_one", "get_all", "create", "update", "delete",
    "legacy/create", "legacy/update", "legacy/delete",
  ]) {
    const text = sql(name);
    assert.ok(text.trim().length > 0, `${name} is empty`);
  }
});

// The projection is the thing that keeps two schemas' shapes identical, so it
// is asserted rather than trusted. created_by_id and updated_by_id exist only
// on leads.leads and must never reach the wire while exchange is still serving.
test("no read projects the columns exchange has no equivalent for", () => {
  for (const name of ["get_one", "get_all", "create", "update"]) {
    const text = body(name);
    assert.doesNotMatch(text, /\bcreated_by_id\b/, `${name} projects created_by_id`);
    assert.doesNotMatch(text, /\bupdated_by_id\b/, `${name} projects updated_by_id`);
  }
});

// A read with a non-unique ORDER BY returns physical order, which changes as
// rows are updated. get_all breaks the tie on id.
test("the list read is deterministically ordered", () => {
  assert.match(body("get_all"), /ORDER BY\s+created_at DESC,\s*id DESC/i);
});

// The repo owns ONE table. A join here would put a second table's shape into a
// row type that claims to be leads.leads.
test("no statement in this feature joins another table", () => {
  for (const name of ["get_one", "get_all", "create", "update", "delete"]) {
    assert.doesNotMatch(body(name), /\bJOIN\b/i, `${name} joins another table`);
  }
});

// The legacy statements target exchange and the rest target leads.leads. Mixing
// them up is the one edit that would silently write the wrong schema.
test("each statement targets the schema its file name claims", () => {
  for (const name of ["get_one", "get_all", "create", "update", "delete"]) {
    assert.match(body(name), /leads\.leads/, `${name} does not target leads.leads`);
    assert.doesNotMatch(body(name), /exchange\./, `${name} touches exchange`);
  }
  for (const name of ["legacy/create", "legacy/update", "legacy/delete"]) {
    assert.match(body(name), /exchange\.leads/, `${name} does not target exchange.leads`);
    assert.doesNotMatch(body(name), /leads\.leads/, `${name} touches leads.leads`);
  }
});
