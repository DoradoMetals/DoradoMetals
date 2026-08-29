// Refuses migrations that could destroy data in the `exchange` schema.
//
// The invariant that makes this whole migration safe: exchange holds every row
// the business has, and nothing in the migration path may overwrite, truncate
// or delete any of it. New schemas are written to; exchange is only ever read
// from, or added to.
//
// Additive changes to exchange are fine - CREATE INDEX, ADD COLUMN, SET DEFAULT
// cannot lose a row. Destructive ones are refused:
//
//   DROP TABLE / SCHEMA / COLUMN     removes data outright
//   TRUNCATE                         removes every row
//   DELETE FROM                      removes rows
//   UPDATE                           overwrites values in place
//   ALTER COLUMN ... TYPE            can silently truncate or fail
//
// There will eventually be a legitimate reason to drop an exchange table: once
// a feature has been serving from the new schema long enough to trust. That is
// a deliberate decision, so it needs a deliberate marker on the line before:
//
//   -- allow-destructive: leads has served from core since 2026-09, backed up
//
// Static only - reads the .sql files, needs no database, runs in CI.
//
// *** WHAT IT CANNOT SEE. This is the guard on "do not lose data", so its gaps
// matter more than most: ***
//   - A STATEMENT SPLIT ACROSS LINES: CLOSED 2026-08-29. The scan now also
//     matches whitespace-normalised three-line windows, so
//     `DROP\n  TABLE exchange.payouts;` is seen. It was NOT seen before, and
//     the run said "no destructive writes to exchange" - found by planting it.
//   - DYNAMIC SQL. A `DO $$ ... EXECUTE format('DROP TABLE %I', t) ... $$` names
//     no table this can read.
//   - A DESTRUCTIVE CHANGE SPELLED ANOTHER WAY: `ALTER TABLE exchange.x RENAME`,
//     `DROP CONSTRAINT`, a `CREATE OR REPLACE VIEW` that narrows a projection,
//     or a trigger that deletes. The list below is the seven shapes that have
//     been reasoned about, not every shape that can lose a row.
//   - ANYTHING NOT IN migrations/*.sql. A destructive statement run from a
//     script, or by hand, is outside this entirely.
//
//   pnpm --filter @dorado/api lint:migrations
//   pnpm --filter @dorado/api lint:migrations:self-test
import fs from "node:fs";
import path from "node:path";

// Overridable ONLY for the self-test, which points the whole script at a
// synthetic migrations directory and confirms it still sees a planted DROP.
const DIR = process.env.LINT_MIGRATIONS_DIR
  ? path.resolve(process.env.LINT_MIGRATIONS_DIR)
  : path.join(import.meta.dirname, "..", "migrations");

if (process.argv.includes("--self-test")) {
  const { selfTest } = await import("./lib/self-test-harness.ts");
  const files = (extra: Record<string, string> = {}) => ({
    "001_create.sql": "CREATE TABLE orders.items (id uuid primary key);\n",
    "002_add.sql": "ALTER TABLE exchange.orders ADD COLUMN note text;\n",
    ...extra,
  });
  const LOW = { LINT_MIGRATIONS_FLOOR: "1" };
  await selfTest({
    script: import.meta.filename,
    cases: [
      {
        name: "a DROP TABLE against exchange is seen",
        rootEnv: "LINT_MIGRATIONS_DIR", env: LOW,
        files: files({ "003_bad.sql": "DROP TABLE exchange.payouts;\n" }),
        expect: "fail", mustPrint: "DROP TABLE against exchange",
      },
      {
        name: "a DELETE against exchange is seen",
        rootEnv: "LINT_MIGRATIONS_DIR", env: LOW,
        files: files({ "003_bad.sql": "DELETE FROM exchange.leads WHERE id = 1;\n" }),
        expect: "fail", mustPrint: "DELETE FROM against exchange",
      },
      {
        name: "an UPDATE against exchange is seen",
        rootEnv: "LINT_MIGRATIONS_DIR", env: LOW,
        files: files({ "003_bad.sql": "UPDATE exchange.scrap SET purity = 1;\n" }),
        expect: "fail", mustPrint: "UPDATE against exchange",
      },
      {
        name: "an explicit allow-destructive marker waives it",
        rootEnv: "LINT_MIGRATIONS_DIR", env: LOW,
        files: files({
          "003_ok.sql":
            "-- allow-destructive: leads served from core since 2026-09, dump taken\n" +
            "DROP TABLE exchange.leads;\n",
        }),
        expect: "pass", mustPrint: "migration check passed",
      },
      {
        name: "a clean directory passes",
        rootEnv: "LINT_MIGRATIONS_DIR", env: LOW,
        files: files({}), expect: "pass", mustPrint: "migration check passed",
      },
      {
        name: "the floor itself fires on a directory far below it",
        rootEnv: "LINT_MIGRATIONS_DIR",
        files: files({}), expect: "fail", mustPrint: "fewer migrations than exist",
      },
      {
        name: "a missing directory is a broken walk, not an empty one",
        rootEnv: "LINT_MIGRATIONS_DIR", env: LOW,
        files: {}, args: ["--dir-must-exist"],
        expect: "fail", mustPrint: "no .sql files",
      },
    ],
  });
}

// TUPLES, DECLARED. As a bare array literal TypeScript widens this to
// `(RegExp | string)[][]`, so `pattern.test(line)` below does not typecheck at
// all - the destructuring silently produced `string | RegExp` on both halves.
// It ran correctly because JavaScript does not care; the point of D157 is that
// nothing was ever in a position to say so.
const DESTRUCTIVE: readonly (readonly [RegExp, string])[] = [
  [/\bDROP\s+TABLE\s+(IF\s+EXISTS\s+)?(ONLY\s+)?"?exchange"?\./i, "DROP TABLE"],
  [/\bDROP\s+SCHEMA\s+(IF\s+EXISTS\s+)?"?exchange"?\b/i, "DROP SCHEMA"],
  [/\bTRUNCATE\s+(TABLE\s+)?(ONLY\s+)?"?exchange"?\./i, "TRUNCATE"],
  [/\bDELETE\s+FROM\s+(ONLY\s+)?"?exchange"?\./i, "DELETE FROM"],
  [/\bUPDATE\s+(ONLY\s+)?"?exchange"?\./i, "UPDATE"],
  [/\bALTER\s+TABLE\s+(ONLY\s+)?"?exchange"?\.[^\n]*\bDROP\s+COLUMN\b/i, "DROP COLUMN"],
  [/\bALTER\s+TABLE\s+(ONLY\s+)?"?exchange"?\.[^\n]*\bALTER\s+COLUMN\b[^\n]*\bTYPE\b/i, "ALTER COLUMN TYPE"],
];

// A DIRECTORY THAT IS NOT THERE IS A BROKEN RUN, NOT A CLEAN ONE. The previous
// version returned [] for a missing directory and printed
// "migration check passed (0 files)" - the exact shape of D135: a report that
// cannot see its subject prints a smaller number and exits 0.
const files = fs.existsSync(DIR)
  ? fs.readdirSync(DIR).filter((f) => f.endsWith(".sql")).sort()
  : [];

if (files.length === 0) {
  console.error(
    `lint:migrations found no .sql files in ${DIR} - the walk is broken, not the ` +
      `migration set empty. This guard protects every row the business has; it ` +
      `must never pass by looking at nothing.`
  );
  process.exit(1);
}

// FLOOR. 102 migrations exist at the time of writing and the number only ever
// grows - migrations are append-only. A count below this means the directory
// resolved somewhere else, not that migrations were deleted.
const FLOOR = process.env.LINT_MIGRATIONS_DIR
  ? Number(process.env.LINT_MIGRATIONS_FLOOR ?? 90)
  : 90;
if (files.length < FLOOR) {
  console.error(
    `lint:migrations read ${files.length} migration(s) from ${DIR}, which is fewer ` +
      `migrations than exist (at least ${FLOOR}). Migrations are append-only, so a ` +
      `count that falls means the walk broke.`
  );
  process.exit(1);
}

const problems: string[] = [];

// A LINE IS NOT A STATEMENT, and this guard used to pretend it was.
//
// The header below the imports still lists the gaps this cannot see; ONE OF
// THEM IS NOW CLOSED. `DROP\n  TABLE exchange.payouts;` used to match nothing
// and the run printed "no destructive writes to exchange" - verified by
// planting exactly that on 2026-08-29, on the guard for the one rule that
// outranks every other rule here.
//
// So the scan now runs over WHITESPACE-NORMALISED WINDOWS as well as raw
// lines: each line is joined with the two that follow it and internal runs of
// whitespace collapse to one space, which is enough to reunite a statement a
// formatter split. It is still not a SQL parser and still cannot see dynamic
// SQL - but a wrapped DROP is no longer invisible, and a formatter run over
// migrations/ can no longer open the hole silently.
const windowsOf = (lines: string[]) =>
  lines.map((line: string, i: number) => ({
    i,
    raw: line,
    // three lines is enough for `DROP`/`TABLE`/`exchange.x;` and cheap enough
    // to do for every line of every migration.
    joined: lines.slice(i, i + 3).join(" ").replace(/\s+/g, " ").trim(),
  }));

for (const file of files) {
  const lines = fs.readFileSync(path.join(DIR, file), "utf8").split("\n");

  windowsOf(lines).forEach(({ i, raw, joined }) => {
    if (raw.trim().startsWith("--")) return;
    const line = joined;

    for (const [pattern, label] of DESTRUCTIVE) {
      if (!pattern.test(line)) continue;

      // An explicit marker on any preceding comment line waives this statement.
      // Look back far enough for a marker that EXPLAINS ITSELF. Six lines was
      // enough when a marker was a sentence; a marker that says why the change
      // is safe and what backup exists is a paragraph, and 086's runs twelve.
      // A waiver window shorter than the waivers people actually write means
      // the guard rejects the well-documented changes and accepts the terse
      // ones, which is precisely backwards.
      const waived = lines
        .slice(Math.max(0, i - 20), i)
        .some((l) => /--\s*allow-destructive:/i.test(l));

      if (!waived) {
        problems.push(
          `${file}:${i + 1}  ${label} against exchange\n      ${raw.trim() || line.trim()}`
        );
      }
    }
  });
}

if (problems.length) {
  console.error(
    `migration check failed (${problems.length}):\n\n` +
      `  exchange holds every row the business has. Migrations may read from it\n` +
      `  and add to it, but must not overwrite, truncate or delete any of it.\n` +
      `  If a destructive change is genuinely intended, mark it:\n\n` +
      `    -- allow-destructive: <why this is safe, and what backup exists>\n`
  );
  for (const p of problems) console.error("  " + p);
  process.exit(1);
}

console.log(
  `migration check passed (${files.length} file${files.length === 1 ? "" : "s"}, no destructive writes to exchange)`
);
