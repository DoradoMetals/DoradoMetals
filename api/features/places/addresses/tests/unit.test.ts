// The parts of addresses that need no database: the statements as text, and
// the in-memory join that replaced a SQL one.
//
// The statements matter more here than elsewhere, because the split moved a
// SECURITY check out of them. exchange scoped its writes with
// `AND user_id = $2`; places.addresses has no user_id to scope on, so the
// checks below are about what each statement can and cannot be trusted to do.
import test from "node:test";
import assert from "node:assert/strict";
import { sqlFrom } from "#shared/db/sql.ts";
import { sqlWithLegacy } from "#shared/testing/sql.ts";
import { compose, byDefaultThenId, all } from "#features/places/addresses/compose.ts";
import type { ComposedAddress } from "#features/places/addresses/compose.ts";

// features/places/addresses/sql AND legacy/places/addresses/sql - the two halves of the
// dual write, pinned against each other in one file (ruling 29 moved the
// mirror out of this feature; the pin did not follow it, because the pin IS
// the comparison between the two).
const sql = sqlWithLegacy("places/addresses");

const body = (name: string): string =>
  sql(name).split("\n").filter((l) => !l.trim().startsWith("--")).join("\n");

const STATEMENTS = [
  "get_one", "get_many", "create", "update", "update_validation",
  "delete", "is_active", "is_referenced",
  "legacy/create", "legacy/update", "legacy/update_validation",
  "legacy/delete", "legacy/set_default",
];

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

// exchange's row carries the owner, the label and one is_default alongside the
// postal fields, and legacy.repo.ts splices them into the same array. The order
// is different from the new schema's on purpose, so it is asserted separately.
test("the exchange write takes its fourteen values in exchange's own order", () => {
  assert.match(
    body("legacy/create"),
    /\(id,\s*user_id,\s*line_1,\s*line_2,\s*city,\s*state,\s*country,\s*zip,\s*name,\s*is_default,\s*phone_number,\s*is_valid,\s*country_code,\s*is_residential\)/,
    "sql/legacy/create.sql column order changed - legacy.repo.ts builds its params to match"
  );
});

// THE ONE THAT MATTERS. exchange's update and delete are still scoped by owner;
// the new schema's cannot be, and the service does it instead. If either
// exchange statement ever lost its scope, a stranger's write would land there
// too rather than being caught by one side.
test("the exchange update and delete are still scoped to the owner", () => {
  assert.match(body("legacy/update"), /WHERE\s+id\s*=\s*\$1\s+AND\s+user_id\s*=\s*\$2/i,
    "sql/legacy/update.sql lost its user_id scope");
  assert.match(body("legacy/delete"), /WHERE\s+id\s*=\s*\$1\s+AND\s+user_id\s*=\s*\$2/i,
    "sql/legacy/delete.sql lost its user_id scope");
  assert.match(body("legacy/set_default"), /WHERE\s+user_id\s*=\s*\$1/i,
    "sql/legacy/set_default.sql lost its user_id scope");
});

// And the new schema's update is NOT scoped, which is a fact worth pinning
// rather than a gap: it is why service.ts reads the link first. If someone
// "fixes" this statement by adding a user_id it will not compile against the
// table, and if they add a join it stops being one table.
test("the new-schema update is keyed on the address alone", () => {
  assert.doesNotMatch(body("update"), /user_id/,
    "places.addresses has no user_id - the ownership check lives in service.ts");
});

test("the writes to places.user_addresses are scoped to the person", () => {
  const ua = sqlFrom(
    new URL("../../user-addresses/", import.meta.url).pathname
  );
  const uaBody = (n: string) =>
    ua(n).split("\n").filter((l) => !l.trim().startsWith("--")).join("\n");

  assert.match(uaBody("update"), /WHERE\s+address_id\s*=\s*\$4\s+AND\s+user_id\s*=\s*\$5/i);
  assert.match(uaBody("delete"), /WHERE\s+address_id\s*=\s*\$1\s+AND\s+user_id\s*=\s*\$2/i);
  assert.match(uaBody("get_one"), /WHERE\s+address_id\s*=\s*\$1\s+AND\s+user_id\s*=\s*\$2/i);
  // set_default is two statements since 089's partial unique index: the
  // one-statement swap held a transient double default and tripped it on
  // row-visit order. Both halves must stay scoped to the person.
  assert.match(uaBody("set_default_clear"), /WHERE\s+user_id\s*=\s*\$1/i);
  assert.match(uaBody("set_default_mark"), /WHERE\s+user_id\s*=\s*\$1/i);
});

// One table per repo, except the two questions that are inherently about
// several - is_active and is_referenced, which are reads and write nothing.
test("no write statement reaches into a second table", () => {
  for (const n of ["get_one", "get_many", "create", "update", "update_validation", "delete"]) {
    assert.doesNotMatch(body(n), /exchange\.|orders\.|user_addresses/, `${n} reaches beyond its table`);
  }
  for (const n of ["legacy/create", "legacy/update", "legacy/update_validation",
                   "legacy/delete", "legacy/set_default"]) {
    assert.doesNotMatch(body(n), /places\.|orders\./, `${n} reaches out of exchange`);
  }
});

// is_referenced has to ask about BOTH columns of orders.addresses. An order
// records the snapshot it took and the book row it came from; missing either
// would delete an address a delivered order points at.
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
  // default_billing must NOT appear: exchange has no second flag and the
  // projection this replaced did not return one.
  assert.ok(!("default_billing" in out.user_address));
});

// ORDER BY ua.default_shipping DESC, a.id ASC. DESC on a boolean puts true
// first, which a naive `a - b` on booleans does not do.
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
