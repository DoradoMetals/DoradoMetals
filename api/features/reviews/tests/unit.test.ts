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
import { sqlWithLegacy } from "#shared/testing/sql.ts";

// features/reviews/sql AND legacy/reviews/sql - the two halves of the
// dual write, pinned against each other in one file (ruling 29 moved the
// mirror out of this feature; the pin did not follow it, because the pin IS
// the comparison between the two).
const sql = sqlWithLegacy("reviews");

const body = (name: string): string =>
  sql(name).split("\n").filter((l) => !l.trim().startsWith("--")).join("\n");

test("every statement loads and is not empty", () => {
  for (const n of ["get_one", "get_all", "get_public", "create", "update", "delete",
                   "legacy/create", "legacy/update", "legacy/delete"]) {
    assert.ok(sql(n).trim().length > 0, `${n} is empty`);
  }
});

// THE ONE THAT CAUGHT ME. repo.ts builds its parameter array by hand; these
// assert the SQL's own order, so a reordered column list fails here rather than
// silently writing a name into the rating column.
test("create writes its columns in the order repo.ts supplies them", () => {
  assert.match(
    body("create"),
    /\(id,\s*name,\s*review_text,\s*rating,\s*hidden,\s*created_by,\s*updated_by\)/,
    "sql/create.sql column order changed - repo.ts builds its params to match"
  );
});

test("update assigns its columns in the order repo.ts supplies them", () => {
  const assignments = [...body("update").matchAll(/(\w+)\s*=\s*\$(\d+)/g)]
    .filter(([, , n]) => Number(n) <= 6)
    .sort((a, b) => Number(a[2]) - Number(b[2]))
    .map(([, col]) => col);
  assert.deepEqual(
    assignments,
    ["name", "review_text", "rating", "hidden", "created_by", "updated_by"],
    "sql/update.sql assignment order changed - repo.ts builds its params to match"
  );
});

// get_public is a SEPARATE statement, not get_all with a parameter. An
// anonymous visitor must not be able to reach a hidden review by any argument.
test("the public read filters hidden rows in the statement itself", () => {
  assert.match(body("get_public"), /hidden\s*=\s*false/i);
  assert.doesNotMatch(body("get_public"), /\$\d/, "get_public takes a parameter - it must not");
  assert.doesNotMatch(body("get_all"), /hidden\s*=/i, "get_all filters on hidden - then it is not get_all");
});

test("no read projects the columns exchange has no equivalent for", () => {
  for (const n of ["get_one", "get_all", "get_public", "create", "update"]) {
    for (const col of ["user_id", "order_id", "created_by_id", "updated_by_id"]) {
      assert.doesNotMatch(body(n), new RegExp(`\\b${col}\\b`), `${n} projects ${col}`);
    }
  }
});

test("each statement targets the schema its file name claims", () => {
  for (const n of ["get_one", "get_all", "get_public", "create", "update", "delete"]) {
    assert.match(body(n), /reviews\.reviews/, `${n} does not target reviews.reviews`);
    assert.doesNotMatch(body(n), /exchange\./, `${n} touches exchange`);
  }
  for (const n of ["legacy/create", "legacy/update", "legacy/delete"]) {
    assert.match(body(n), /exchange\.reviews/, `${n} does not target exchange.reviews`);
    assert.doesNotMatch(body(n), /reviews\.reviews/, `${n} touches reviews.reviews`);
  }
});

test("no statement joins another table", () => {
  for (const n of ["get_one", "get_all", "get_public", "create", "update", "delete"]) {
    assert.doesNotMatch(body(n), /\bJOIN\b/i, `${n} joins another table`);
  }
});
