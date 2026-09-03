// The parts of reviews that need no database: the wire conversion, and the
// statements as text.
//
// The statement checks matter more here than they look. Moving SQL into .sql
// files means a typo is no longer a TypeScript syntax error, and the parameter
// ORDER in repo.ts is hand-written against generated SQL - which is the one
// transcription error the generator cannot prevent. It caught me once on this
// very feature, so the order is asserted rather than trusted.
import test from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { sqlFrom } from "#shared/db/sql.ts";
import { buildUpdate } from "#shared/db/patch.ts";
import { PATCHABLE } from "#db/reviews/repo.ts";

// sql/update.sql IS GONE. The one UPDATE is built by shared/db/patch.ts from
// the column list the repo exports, so the statement is asserted where it is
// now made - from the builder's own output rather than from a file. Same
// claims, moved to the new source of truth.
const built = (patch: Record<string, unknown>) =>
  buildUpdate({ table: "reviews.reviews", allowed: PATCHABLE, patch, where: { id: "x" } });

// db/reviews/sql - the statements as text.
const sql = sqlFrom(path.join(import.meta.dirname, "..", "..", "..", "db", "reviews"));

const body = (name: string): string =>
  sql(name).split("\n").filter((l) => !l.trim().startsWith("--")).join("\n");

test("every statement loads and is not empty", () => {
  for (const n of ["get_one", "get_all", "get_public", "create", "delete"]) {
    assert.ok(sql(n).trim().length > 0, `${n} is empty`);
  }
});

// THE ONE THAT CAUGHT ME. repo.ts builds its parameter array by hand; these
// assert the SQL's own order, so a reordered column list fails here rather than
// silently writing a name into the rating column.
test("create writes its columns in the order repo.ts supplies them", () => {
  assert.match(
    body("create"),
    /\(id,\s*name,\s*review_text,\s*rating,\s*hidden\)/,
    "sql/create.sql column order changed - repo.ts builds its params to match"
  );
});

// NO AUDIT COLUMN IS WRITTEN BY ANY STATEMENT THIS FEATURE OWNS. created_by
// and updated_by used to be two of create.sql's parameters and one of
// update.sql's; public.audit_stamp writes both now (migration 116), and a
// second writer would be a silent fight over the same column.
test("no statement writes an audit column", () => {
  const patch = { name: "n", review_text: "t", rating: 5, hidden: false };
  for (const col of ["created_by", "updated_by", "created_by_id", "updated_by_id", "updated_at"]) {
    assert.doesNotMatch(
      body("create").split("RETURNING")[0], new RegExp(`\\b${col}\\b`),
      `create.sql writes ${col} - the trigger owns it`
    );
    assert.doesNotMatch(built(patch)!.text, new RegExp(`\\b${col}\\b`),
      `the built UPDATE writes ${col} - the trigger owns it`);
  }
});

// THE COALESCE STATEMENT IS GONE AND ITS ONE DEFECT WITH IT. It could not tell
// "leave this column alone" from "clear it": both arrived as null. The builder
// writes only the keys the patch carries, so this asserts what each of the two
// cases now produces.
test("the update writes the keys the patch carries, and only those", () => {
  const one = built({ hidden: true })!;
  assert.match(one.text, /^UPDATE reviews\.reviews SET hidden = \$1\b/);
  assert.deepEqual(one.values, [true, "x"]);

  const all = built({ name: "n", review_text: "t", rating: 5, hidden: false })!;
  // The SET list only - the WHERE binds `id` and would otherwise read as a
  // sixth assignment.
  const sets = all.text.split(" WHERE")[0];
  const assignments = [...sets.matchAll(/(\w+) = \$\d+/g)].map(([, c]) => c);
  assert.deepEqual(assignments, ["name", "review_text", "rating", "hidden"]);
});

// An explicit null CLEARS, which is the whole reason the COALESCE statement
// had to go. An absent key is not in the SET list at all.
test("an explicit null is written and an absent key is not", () => {
  const cleared = built({ review_text: null })!;
  assert.match(cleared.text, /SET review_text = \$1/);
  assert.deepEqual(cleared.values, [null, "x"]);
  assert.equal(built({}), null, "an empty patch must not produce a statement");
});

// get_public is a SEPARATE statement, not get_all with a parameter. An
// anonymous visitor must not be able to reach a hidden review by any argument.
test("the public read filters hidden rows in the statement itself", () => {
  assert.match(body("get_public"), /hidden\s*=\s*false/i);
  assert.doesNotMatch(body("get_public"), /\$\d/, "get_public takes a parameter - it must not");
  assert.doesNotMatch(body("get_all"), /hidden\s*=/i, "get_all filters on hidden - then it is not get_all");
});

test("no read projects the columns exchange has no equivalent for", () => {
  for (const n of ["get_one", "get_all", "get_public", "create"]) {
    for (const col of ["user_id", "order_id", "created_by_id", "updated_by_id"]) {
      assert.doesNotMatch(body(n), new RegExp(`\\b${col}\\b`), `${n} projects ${col}`);
    }
  }
});

test("each statement targets the schema its file name claims", () => {
  for (const n of ["get_one", "get_all", "get_public", "create", "delete"]) {
    assert.match(body(n), /reviews\.reviews/, `${n} does not target reviews.reviews`);
    assert.doesNotMatch(body(n), /exchange\./, `${n} touches exchange`);
  }
  assert.match(built({ hidden: true })!.text, /reviews\.reviews/);
});

test("no statement joins another table", () => {
  for (const n of ["get_one", "get_all", "get_public", "create", "delete"]) {
    assert.doesNotMatch(body(n), /\bJOIN\b/i, `${n} joins another table`);
  }
  assert.doesNotMatch(built({ hidden: true })!.text, /\bJOIN\b/i);
});
