import { test } from "vitest";
import assert from "node:assert/strict";
import path from "node:path";
import { sqlFrom } from "#shared/db/sql.ts";
import { buildUpdate } from "#shared/db/patch.ts";
import { PATCHABLE } from "#db/places/addresses/repo.ts";
import { PATCHABLE as UA_PATCHABLE } from "#db/places/user-addresses/repo.ts";
import * as rules from "#domain/places/addresses/rules.ts";
import type { Address, UserAddress } from "@dorado/contracts";

const sql = sqlFrom(path.join(import.meta.dirname, "..", "..", "..", "..", "db", "places", "addresses"));

const body = (name: string): string =>
  sql(name).split("\n").filter((l) => !l.trim().startsWith("--")).join("\n");

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
    /\(line_1,\s*line_2,\s*city,\s*state,\s*country,\s*zip,\s*country_code,\s*phone_number,\s*is_valid,\s*is_residential\)/,
    "sql/create.sql column order changed - repo.ts builds its params to match"
  );
});

test("the new-schema update is keyed on the address alone", () => {
  const text = built({ line_1: "1 A" }).text;
  assert.match(text, /WHERE id = \$2$/, "the dynamic UPDATE must key on id alone");
  assert.doesNotMatch(text, /user_id/,
    "places.addresses has no user_id - the ownership check lives in service.ts");
});

test("the update writes no audit column", () => {
  const sets = built(Object.fromEntries(PATCHABLE.map((c) => [c, null])))
    .text.split(" WHERE")[0];
  for (const col of ["created_at", "updated_at", "created_by", "updated_by"]) {
    assert.doesNotMatch(sets, new RegExp(`\\b${col}\\b`), `the built UPDATE writes ${col}`);
  }
});

test("the writes to places.user_addresses are scoped to the person", () => {
  const ua = sqlFrom(
    path.join(import.meta.dirname, "..", "..", "..", "..", "db", "places", "user-addresses")
  );
  const uaBody = (n: string) =>
    ua(n).split("\n").filter((l) => !l.trim().startsWith("--")).join("\n");

  const uaUpdate = buildUpdate({
    table: "places.user_addresses", allowed: UA_PATCHABLE,
    patch: { recipient_name: "Ada", label: "Home", default_shipping: true, default_billing: true },
    where: { address_id: "a", user_id: "u" },
  })!;
  assert.match(uaUpdate.text, /WHERE address_id = \$5 AND user_id = \$6/i);
  assert.match(uaBody("delete"), /WHERE\s+address_id\s*=\s*\$1\s+AND\s+user_id\s*=\s*\$2/i);
  assert.match(uaBody("get_one"), /WHERE\s+address_id\s*=\s*\$1\s+AND\s+user_id\s*=\s*\$2/i);
  assert.match(uaBody("set_default_clear"), /WHERE\s+user_id\s*=\s*\$1/i);
  assert.match(uaBody("set_default_mark"), /WHERE\s+user_id\s*=\s*\$1/i);
});

test("no write statement reaches into a second table", () => {
  for (const n of ["get_one", "get_many", "create", "delete"]) {
    assert.doesNotMatch(body(n), /exchange\.|orders\.|user_addresses/, `${n} reaches beyond its table`);
  }
  const text = built(Object.fromEntries(PATCHABLE.map((c) => [c, null]))).text;
  assert.doesNotMatch(text, /exchange\.|orders\.|user_addresses/, "update reaches beyond its table");
});

test("is_referenced asks about both of the order's address columns", () => {
  assert.match(body("is_referenced"), /source_address_id/);
  assert.match(body("is_referenced"), /\baddress_id\b/);
  assert.match(body("is_referenced"), /places\.user_addresses/);
});

const address = (id: string) => ({ id }) as Address;
const link = (address_id: string, dflt: boolean, recipient = "l") =>
  ({
    id: "x", address_id, user_id: "u", recipient_name: recipient, label: "n",
    default_shipping: dflt, default_billing: dflt,
  }) as UserAddress;

test("an entry keeps the two rows apart and never leaks default_billing", () => {
  const out = rules.entry(address("a"), link("a", true), false);
  assert.equal(out.address.id, "a");
  assert.deepEqual(Object.keys(out.user_address).sort(),
    ["address_id", "default_shipping", "label", "recipient_name", "user_id"]);
  assert.ok(!("default_billing" in out.user_address));
});

test("an address an unfinished order depends on offers neither edit nor remove", () => {
  const locked = rules.entry(address("a"), link("a", false), true);
  assert.deepEqual(locked.actions, { edit: false, remove: false, set_default: true });
  const free = rules.entry(address("b"), link("b", true), false);
  assert.deepEqual(free.actions, { edit: true, remove: true, set_default: false });
});

test("assertNotOnAnActiveOrder refuses exactly what actions.edit reports", () => {
  assert.throws(() => rules.assertNotOnAnActiveOrder(true, "edited"), /active order/);
  assert.doesNotThrow(() => rules.assertNotOnAnActiveOrder(false, "edited"));
});

test("the sort puts the default first, then orders by recipient", () => {
  const rows = [
    rules.entry(address("c"), link("c", false, "Zoe"), false),
    rules.entry(address("a"), link("a", false, "Ada"), false),
    rules.entry(address("b"), link("b", true, "Moe"), false),
  ];
  assert.deepEqual(
    [...rows].sort(rules.byDefaultThenRecipient).map((r) => r.address.id),
    ["b", "a", "c"]
  );
});

test("the first address in a book is the default however the caller asked", () => {
  assert.equal(rules.defaultOnCreate(0, false), true);
  assert.equal(rules.defaultOnCreate(0, undefined), true);
  assert.equal(rules.defaultOnCreate(3, undefined), false);
  assert.equal(rules.defaultOnCreate(3, true), true);
});

test("an edit resets the carrier's answer about the address", () => {
  const cols = rules.editedColumns({ line_1: "1 A" });
  assert.equal(cols.is_valid, false);
  assert.equal(cols.is_residential, false);
});

test("the link patch carries the recipient and the nickname, never a default", () => {
  const cols = rules.linkColumns({ recipient_name: "Ada", label: "Home", default_shipping: true });
  assert.deepEqual(cols, { recipient_name: "Ada", label: "Home" });
});

test("a place search shorter than three characters is refused before the provider", () => {
  assert.throws(() => rules.assertSearchText("  a "), /three characters/);
  assert.equal(rules.assertSearchText("  123 Main "), "123 Main");
});
