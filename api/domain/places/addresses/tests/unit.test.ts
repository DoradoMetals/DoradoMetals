// The parts of addresses that need no database: the statements as text, and the in-memory join that replaced a SQL one.
// The statements matter more here than elsewhere: places.addresses has no user_id to scope on, so the checks below are about what each statement can and cannot be trusted to do.
import { test } from "vitest";
import assert from "node:assert/strict";
import path from "node:path";
import { sqlFrom } from "#shared/db/sql.ts";
import { buildUpdate } from "#shared/db/patch.ts";
import { PATCHABLE } from "#db/places/addresses/repo.ts";
import { PATCHABLE as UA_PATCHABLE } from "#db/places/user-addresses/repo.ts";
import { compose, byDefaultThenId, all } from "#domain/places/addresses/compose.ts";
import type { ComposedAddress } from "#domain/places/addresses/compose.ts";

// db/places/addresses/sql - the statements as text.
const sql = sqlFrom(path.join(import.meta.dirname, "..", "..", "..", "..", "db", "places", "addresses"));

const body = (name: string): string =>
  sql(name).split("\n").filter((l) => !l.trim().startsWith("--")).join("\n");

// Built with shared/db/patch.ts rather than asserted as source text - a source-text match could pass on a string in a comment.
const built = (patch: Record<string, unknown>) =>
  buildUpdate({ table: "places.addresses", allowed: PATCHABLE, patch, where: { id: "x" } })!;

const STATEMENTS = ["get_one", "get_many", "create", "delete", "is_active", "is_referenced"];

test("every statement loads and is not empty", () => {
  for (const n of STATEMENTS) {
    assert.ok(sql(n).trim().length > 0, `${n} is empty`);
  }
});

test("create writes its columns in the order repo.ts supplies them", () => {
  assert.match(
    body("create"),
    /\(id,\s*line_1,\s*line_2,\s*city,\s*state,\s*country,\s*zip,\s*country_code,\s*phone_number,\s*is_valid,\s*is_residential\)/,
    "sql/create.sql column order changed - repo.ts builds its params to match"
  );
});

// The update is NOT scoped by user - a fact, not a gap: it's why service.ts reads the link first. Adding a user_id here won't compile against this table.
test("the new-schema update is keyed on the address alone", () => {
  const text = built({ line_1: "1 A" }).text;
  assert.match(text, /WHERE id = \$2$/, "the dynamic UPDATE must key on id alone");
  assert.doesNotMatch(text, /user_id/,
    "places.addresses has no user_id - the ownership check lives in service.ts");
});

// updated_at is not in the SET list - public.audit_stamp writes it, so a statement that also wrote it would be a second author for one column.
test("the update writes no audit column", () => {
  const sets = built(Object.fromEntries(PATCHABLE.map((c) => [c, null])))
    .text.split(" WHERE")[0];
  for (const col of ["created_at", "updated_at", "created_by", "updated_by"]) {
    assert.doesNotMatch(sets, new RegExp(`\\b${col}\\b`), `the built UPDATE writes ${col}`);
  }
});

test("the writes to places.user_addresses are scoped to the person", () => {
  // user-addresses has no service or controller (db-only), so it lives under db/ - no longer a sibling of this test's own feature.
  const ua = sqlFrom(
    path.join(import.meta.dirname, "..", "..", "..", "..", "db", "places", "user-addresses")
  );
  const uaBody = (n: string) =>
    ua(n).split("\n").filter((l) => !l.trim().startsWith("--")).join("\n");

  // The ownership guard rides in the WHERE - the point of this test, and why the builder takes a `where` map rather than an id.
  const uaUpdate = buildUpdate({
    table: "places.user_addresses", allowed: UA_PATCHABLE,
    patch: { label: "Home", default_shipping: true, default_billing: true },
    where: { address_id: "a", user_id: "u" },
  })!;
  assert.match(uaUpdate.text, /WHERE address_id = \$4 AND user_id = \$5/i);
  assert.match(uaBody("delete"), /WHERE\s+address_id\s*=\s*\$1\s+AND\s+user_id\s*=\s*\$2/i);
  assert.match(uaBody("get_one"), /WHERE\s+address_id\s*=\s*\$1\s+AND\s+user_id\s*=\s*\$2/i);
  // set_default is two statements (a one-statement swap trips the partial unique index on row-visit order) - both halves must stay scoped to the person.
  assert.match(uaBody("set_default_clear"), /WHERE\s+user_id\s*=\s*\$1/i);
  assert.match(uaBody("set_default_mark"), /WHERE\s+user_id\s*=\s*\$1/i);
});

// One table per repo, except the two questions inherently about several - is_active and is_referenced, which are reads and write nothing.
test("no write statement reaches into a second table", () => {
  for (const n of ["get_one", "get_many", "create", "delete"]) {
    assert.doesNotMatch(body(n), /exchange\.|orders\.|user_addresses/, `${n} reaches beyond its table`);
  }
  const text = built(Object.fromEntries(PATCHABLE.map((c) => [c, null]))).text;
  assert.doesNotMatch(text, /exchange\.|orders\.|user_addresses/, "update reaches beyond its table");
});

// is_referenced must ask about BOTH columns of orders.addresses - missing either would delete an address a delivered order points at.
test("is_referenced asks about both of the order's address columns", () => {
  assert.match(body("is_referenced"), /source_address_id/);
  assert.match(body("is_referenced"), /\baddress_id\b/);
  assert.match(body("is_referenced"), /places\.user_addresses/);
});

// ---------------------------------------------------------------- compose.ts

const address = (id: string) => ({ id }) as never;
const link = (address_id: string, dflt: boolean) =>
  ({ address_id, user_id: "u", label: "l", default_shipping: dflt, default_billing: dflt, id: "x" }) as never;

test("compose nests the person's side and leaves the address flat", () => {
  const out = compose(address("a"), link("a", true));
  assert.equal(out.id, "a");
  assert.deepEqual(Object.keys(out.user_address).sort(),
    ["default_shipping", "label", "user_id"]);
  // default_billing must NOT appear on the wire.
  assert.ok(!("default_billing" in out.user_address));
});

// DESC on a boolean puts true first, which a naive `a - b` on booleans does not do.
test("the sort puts the default first, then orders by id", () => {
  const rows = [
    compose(address("c"), link("c", false)),
    compose(address("a"), link("a", false)),
    compose(address("b"), link("b", true)),
  ];
  assert.deepEqual(
    [...rows].sort(byDefaultThenId).map((r: ComposedAddress) => r.id),
    ["b", "a", "c"]
  );
});

// An inner join by another name: a link whose address is missing is dropped,
// not composed with undefined.
test("a link with no address is dropped rather than composed with nothing", () => {
  const out = all([link("a", false), link("gone", false)], [address("a")]);
  assert.deepEqual(out.map((r) => r.id), ["a"]);
});
