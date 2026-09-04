// An unset DATABASE_URL does not fail. It connects somewhere else.
//
// pg falls back to the PG* variables, and #env sets PGHOST and PGPORT. Measured
// rather than assumed: with the parts of the URL blanked so composition fails,
// a pg Client resolved host "localhost", database "jtj60" and user "jtj60" -
// the OS account - and would have opened a perfectly working connection to it.
//
// The production exception is the surprising half and the reason this file
// exists. Whatever production resolves today is what it has always resolved; a
// refusal there could only take a working site down over a variable that
// cannot be read from here. Everywhere else, an unset URL means composition
// failed and connecting anyway is never what was wanted.

import { test } from "vitest";
import assert from "node:assert/strict";

import { refusesUnsetDatabaseUrl } from "#pool";

test("an unset DATABASE_URL is refused everywhere except production", () => {
  for (const NODE_ENV of ["test", "development", undefined, "staging"]) {
    assert.equal(
      refusesUnsetDatabaseUrl({ NODE_ENV }),
      true,
      `NODE_ENV=${NODE_ENV} must refuse rather than fall back to PGHOST`
    );
  }
});

test("production is let through, deliberately", () => {
  assert.equal(
    refusesUnsetDatabaseUrl({ NODE_ENV: "production" }),
    false,
    "a refusal in production could only take a working site down - whatever it " +
      "resolves today is what it has always resolved"
  );
});

test("a set DATABASE_URL is never refused", () => {
  for (const NODE_ENV of ["test", "production", undefined]) {
    assert.equal(
      refusesUnsetDatabaseUrl({ DATABASE_URL: "postgresql://u:p@h:5432/d", NODE_ENV }),
      false
    );
  }
});

test("an EMPTY DATABASE_URL counts as unset", () => {
  // This is the state composition actually leaves behind when a part is
  // missing, so it is the case that matters rather than a tidy edge.
  assert.equal(refusesUnsetDatabaseUrl({ DATABASE_URL: "", NODE_ENV: "test" }), true);
});
