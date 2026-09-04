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
  assert.equal(refusesUnsetDatabaseUrl({ DATABASE_URL: "", NODE_ENV: "test" }), true);
});
