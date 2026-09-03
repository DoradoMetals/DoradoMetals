// The one dynamic UPDATE builder, on its own.
//
// Nothing here needs a database: the whole point of shared/db/patch.ts is that
// the statement is a pure function of a table name, a whitelist and a patch, so
// the properties that matter can be asserted directly rather than inferred from
// a row afterwards.
//
// THE PROPERTIES ARE NOT COSMETIC. Two of them are the reason this file
// replaced eight hand-written statements:
//
//   an ABSENT key is not written        - validation must not blank an address
//   a key present with NULL clears      - COALESCE could express neither
//
// and one is a boundary: the SET list is interpolated, so a key that is not in
// `allowed` must never reach the text.
import test from "node:test";
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

// The distinction COALESCE could not make. "Leave notes alone" and "empty
// notes" arrived at the old statement as the same null and both meant leave.
test("an absent key is untouched and an explicit null clears the column", () => {
  assert.doesNotMatch(build({ name: "n" })!.text, /notes/, "an absent key reached the SET list");

  const cleared = build({ notes: null })!;
  assert.match(cleared.text, /SET notes = \$1/);
  assert.deepEqual(cleared.values, [null, "x"]);
});

test("a patch naming no allowed column produces no statement at all", () => {
  assert.equal(build({}), null, "an empty patch must not become UPDATE ... SET");
});

// THE BOUNDARY. Values are always parameters; only names from `allowed` are
// concatenated into the text, so a key from a request body that is not a
// column is refused here rather than becoming SQL.
test("a key outside the whitelist is refused, not silently dropped", () => {
  assert.throws(() => build({ nonsense: 1 }), /"nonsense" is not a patchable column/);
  assert.throws(
    () => build({ "id = 1; DROP TABLE leads.leads --": 1 }),
    /is not a patchable column/
  );
});

// The audit columns have exactly one writer - the public.audit_stamp trigger
// (migration 116). A patch naming one would be a second, and the two would
// disagree silently rather than fail.
test("an audit column in a patch is refused by name, whatever the whitelist says", () => {
  for (const col of ["created_at", "updated_at", "created_by", "updated_by",
                     "created_by_id", "updated_by_id"]) {
    assert.throws(
      () => buildUpdate({
        table: "leads.leads",
        // Deliberately allowed, to prove the refusal does not depend on the
        // caller having remembered to leave it out.
        allowed: [...ALLOWED, col],
        patch: { [col]: "whoever" },
        where: { id: "x" },
      }),
      new RegExp(`"${col}" is written by the audit_stamp trigger`),
      `${col} was accepted as a patchable column`
    );
  }
});

// THE OWNERSHIP GUARD RIDES IN THE WHERE, which is why `where` is a map and
// not an id. places.user_addresses keys on (address_id, user_id) and an
// address in somebody else's book must match no row.
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

// An UPDATE with no WHERE rewrites every row in the table. It cannot happen by
// accident through this - the type requires `where` - so this pins the runtime
// refusal for the caller that builds one dynamically and ends up with none.
test("an empty where is refused rather than rewriting the table", () => {
  assert.throws(
    () => buildUpdate({ table: "leads.leads", allowed: ALLOWED, patch: { name: "n" }, where: {} }),
    /an UPDATE with no WHERE would rewrite every row/
  );
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

// THE ONE THAT BROKE A LIVE ENDPOINT. `key in obj` is true for
// `{ label: undefined }`, and transport/fulfillments/methods/controller.ts
// names all four columns whether or not the caller sent any of them - so an
// admin flipping `hidden` arrived with three undefined siblings, and writing
// them meant NULL into three NOT NULL columns. A 500 there; silent data loss
// on any nullable column.
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
