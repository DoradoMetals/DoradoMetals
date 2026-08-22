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
//   pnpm --filter @dorado/api lint:migrations
import fs from "node:fs";
import path from "node:path";

const DIR = path.join(import.meta.dirname, "..", "migrations");

const DESTRUCTIVE = [
  [/\bDROP\s+TABLE\s+(IF\s+EXISTS\s+)?(ONLY\s+)?"?exchange"?\./i, "DROP TABLE"],
  [/\bDROP\s+SCHEMA\s+(IF\s+EXISTS\s+)?"?exchange"?\b/i, "DROP SCHEMA"],
  [/\bTRUNCATE\s+(TABLE\s+)?(ONLY\s+)?"?exchange"?\./i, "TRUNCATE"],
  [/\bDELETE\s+FROM\s+(ONLY\s+)?"?exchange"?\./i, "DELETE FROM"],
  [/\bUPDATE\s+(ONLY\s+)?"?exchange"?\./i, "UPDATE"],
  [/\bALTER\s+TABLE\s+(ONLY\s+)?"?exchange"?\.[^\n]*\bDROP\s+COLUMN\b/i, "DROP COLUMN"],
  [/\bALTER\s+TABLE\s+(ONLY\s+)?"?exchange"?\.[^\n]*\bALTER\s+COLUMN\b[^\n]*\bTYPE\b/i, "ALTER COLUMN TYPE"],
];

const files = fs.existsSync(DIR)
  ? fs.readdirSync(DIR).filter((f) => f.endsWith(".sql")).sort()
  : [];

const problems = [];

for (const file of files) {
  const lines = fs.readFileSync(path.join(DIR, file), "utf8").split("\n");

  lines.forEach((line, i) => {
    if (line.trim().startsWith("--")) return;

    for (const [pattern, label] of DESTRUCTIVE) {
      if (!pattern.test(line)) continue;

      // An explicit marker on any preceding comment line waives this statement.
      const waived = lines
        .slice(Math.max(0, i - 6), i)
        .some((l) => /--\s*allow-destructive:/i.test(l));

      if (!waived) {
        problems.push(
          `${file}:${i + 1}  ${label} against exchange\n      ${line.trim()}`
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
