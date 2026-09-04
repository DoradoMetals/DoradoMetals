import { test } from "vitest";
import assert from "node:assert/strict";
import { buildUpdate } from "#shared/db/patch.ts";

const ALLOWED = ["name", "notes", "priority"] as const;
const build = (patch: Record<string, unknown>, extra = {}) =>
  buildUpdate({ table: "leads.leads", allowed: ALLOWED, patch, where: { id: "x" }, ...extra });

test("only the keys the patch carries are written, in the whitelist's order", () => {
  const built = build({ priority: "High", name: "n" })!;
  assert.equal(built.text.split("\n")[0], "UPDATE leads.leads SET name = $1, priority = $2");
  assert.deepEqual(built.values, ["n", "High", "x"]);
});

test("an absent key is untouched and an explicit null clears the column", () => {
  assert.doesNotMatch(build({ name: "n" })!.text, /notes/, "an absent key reached the SET list");

  const cleared = build({ notes: null })!;
  assert.match(cleared.text, /SET notes = \$1/);
  assert.deepEqual(cleared.values, [null, "x"]);
});

test("a patch naming no allowed column produces no statement at all", () => {
  assert.equal(build({}), null, "an empty patch must not become UPDATE ... SET");
});

test("a key outside the whitelist is refused, not silently dropped", () => {
  assert.throws(() => build({ nonsense: 1 }), /"nonsense" is not a patchable column/);
  assert.throws(
    () => build({ "id = 1; DROP TABLE leads.leads --": 1 }),
    /is not a patchable column/
  );
});

test("an audit column in a patch is refused by name, whatever the whitelist says", () => {
  for (const col of ["created_at", "updated_at", "created_by", "updated_by",
                     "created_by_id", "updated_by_id"]) {
    assert.throws(
      () => buildUpdate({
        table: "leads.leads",
        allowed: [...ALLOWED, col],
        patch: { [col]: "whoever" },
        where: { id: "x" },
      }),
      new RegExp(`"${col}" is written by the audit_stamp trigger`),
      `${col} was accepted as a patchable column`
    );
  }
});

test("every where entry is ANDed into the statement as a parameter", () => {
  const built = buildUpdate({
    table: "places.user_addresses",
    allowed: ["label"],
    patch: { label: "Home" },
    where: { address_id: "a", user_id: "u" },
  })!;
  assert.match(built.text, /WHERE address_id = \$2 AND user_id = \$3/);
  assert.deepEqual(built.values, ["Home", "a", "u"]);
});

test("an empty where is refused rather than rewriting the table", () => {
  assert.throws(
    () => buildUpdate({ table: "leads.leads", allowed: ALLOWED, patch: { name: "n" }, where: {} }),
    /an UPDATE with no WHERE would rewrite every row/
  );
});

test("whereNull adds an IS NULL guard that binds no parameter", () => {
  const built = buildUpdate({
    table: "fulfillments.fulfillments",
    allowed: ["order_id"],
    patch: { order_id: "o1" },
    where: { id: "f1" },
    whereNull: ["order_id"],
  })!;
  assert.match(built.text, /WHERE id = \$2 AND order_id IS NULL/);
  assert.deepEqual(built.values, ["o1", "f1"]);
});

test("a cast is applied to the parameter, in the SET list and in the WHERE", () => {
  const built = buildUpdate({
    table: "orders.orders",
    allowed: ["status"],
    patch: { status: "Pending" },
    where: { id: "x", direction: "sale" },
    casts: { direction: "orders.direction" },
    returning: "id",
  })!;
  assert.match(built.text, /direction = \$3::orders\.direction/);
  assert.match(built.text, /RETURNING id$/);
});

test("a key whose value is undefined is not written, and null still clears", () => {
  const partial = build({ name: "n", notes: undefined, priority: undefined })!;
  assert.equal(partial.text.split("\n")[0], "UPDATE leads.leads SET name = $1");
  assert.deepEqual(partial.values, ["n", "x"]);

  assert.equal(
    build({ name: undefined }), null,
    "a patch of nothing but undefined must produce no statement"
  );
  assert.match(build({ name: null })!.text, /SET name = \$1/, "an explicit null stopped clearing");
});
