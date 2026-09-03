// The baseline logic decides which migrations are recorded without running.
// Getting the range wrong either replays a migration that fails, or skips one a
// production database genuinely needs - 001 indexes exchange's foreign keys and
// is deliberately outside the range.
import { test } from "vitest";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { parseBaseline, coveredBy } from "../baseline.ts";

const names = [
  "000_genesis_schema.sql",
  "001_index_foreign_keys.sql",
  "002_core_leads_priority.sql",
  "015_restore_timestamp_precision.sql",
  "028_close_orders_copy_gaps.sql",
  "029_later_work.sql",
];
const files = names.map((name) => ({ name, checksum: name }));

test("a baseline range is read off the file", () => {
  assert.deepEqual(parseBaseline("-- baseline: 002-028\n-- more"), {
    from: "002",
    through: "028",
  });
});

test("a file without a marker declares no baseline", () => {
  assert.equal(parseBaseline("-- just a migration\nALTER TABLE x ADD COLUMN y int;"), null);
  // A ceiling is not a range, and must not be read as one.
  assert.equal(parseBaseline("-- baseline: 028"), null);
});

test("the marker is only honoured as a leading comment", () => {
  assert.equal(parseBaseline("SELECT '-- baseline: 002-028';"), null);
});

test("the range covers what it should and nothing else", () => {
  const covered = coveredBy({ from: "002", through: "028" }, "000_genesis_schema.sql", files)
    .map((f) => f.name);
  assert.deepEqual(covered, [
    "002_core_leads_priority.sql",
    "015_restore_timestamp_precision.sql",
    "028_close_orders_copy_gaps.sql",
  ]);
});

// The whole reason the baseline is a range. 001 indexes foreign keys on
// exchange; a production database has exchange and has never had those indexes.
test("001 is not covered, because production still needs it", () => {
  const covered = coveredBy({ from: "002", through: "028" }, "000_genesis_schema.sql", files);
  assert.equal(covered.some((f) => f.name.startsWith("001")), false);
});

test("work after the baseline still runs", () => {
  const covered = coveredBy({ from: "002", through: "028" }, "000_genesis_schema.sql", files);
  assert.equal(covered.some((f) => f.name.startsWith("029")), false);
});

test("the baseline never covers itself", () => {
  const covered = coveredBy({ from: "000", through: "028" }, "000_genesis_schema.sql", files);
  assert.equal(covered.some((f) => f.name.startsWith("000")), false);
});

// On dev everything in range is already in the ledger, so a baseline added
// after the fact stamps nothing and skips nothing.
test("already-applied migrations are left alone", () => {
  const applied = new Set(names.filter((n) => !n.startsWith("000")));
  assert.deepEqual(coveredBy({ from: "002", through: "028" }, "000_genesis_schema.sql", files, applied), []);
});

// Checked against the real file. Genesis does NOT need regenerating every time
// a migration is added: a fresh database builds the shape as of `through`,
// skips what that covers, and runs everything after it normally. What must hold
// is that the range names migrations that actually exist - a `through` past the
// end of the directory would silently swallow migrations yet to be written.
test("the genesis migration declares a range that exists on disk", () => {
  const dir = path.join(import.meta.dirname, "..", "..", "..", "migrations");
  const genesis = fs.readFileSync(path.join(dir, "000_genesis_schema.sql"), "utf8");
  const baseline = parseBaseline(genesis);
  assert.ok(baseline, "000_genesis_schema.sql has no baseline marker");
  assert.equal(baseline.from, "002", "001 indexes exchange and must stay outside the range");

  const onDisk = fs.readdirSync(dir).filter((f) => f.endsWith(".sql")).sort();
  // `.at(-1)` on an empty directory is undefined, and the comparison below
  // would then have been `baseline.through <= undefined` - false, so the test
  // would fail, but naming a directory that resolved nowhere rather than a
  // baseline that is wrong.
  const last = onDisk.at(-1);
  assert.ok(last, `no .sql files in ${dir} - the migrations directory did not resolve`);
  const highest = last.slice(0, 3);
  assert.ok(
    baseline.through <= highest,
    `genesis claims a baseline through ${baseline.through}, past the last migration on disk (${highest})`
  );
  assert.ok(
    onDisk.some((f) => f.startsWith(baseline.through)),
    `genesis baselines through ${baseline.through}, which is not a migration that exists`
  );
});
