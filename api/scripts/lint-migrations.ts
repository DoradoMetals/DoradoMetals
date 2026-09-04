import fs from "node:fs";
import path from "node:path";

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
        name: "NARROWING a column type against exchange is seen",
        rootEnv: "LINT_MIGRATIONS_DIR", env: LOW,
        files: files({ "003_bad.sql": "ALTER TABLE exchange.scrap ALTER COLUMN purity TYPE numeric(4,3);\n" }),
        expect: "fail", mustPrint: "ALTER COLUMN TYPE against exchange",
      },
      {
        name: "WIDENING to unconstrained numeric is not a finding",
        rootEnv: "LINT_MIGRATIONS_DIR", env: LOW,
        files: files({ "003_ok.sql": "ALTER TABLE exchange.scrap ALTER COLUMN purity TYPE numeric;\n" }),
        expect: "pass", mustPrint: "no destructive writes",
      },
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

const DESTRUCTIVE: readonly (readonly [RegExp, string])[] = [
  [/\bDROP\s+TABLE\s+(IF\s+EXISTS\s+)?(ONLY\s+)?"?exchange"?\./i, "DROP TABLE"],
  [/\bDROP\s+SCHEMA\s+(IF\s+EXISTS\s+)?"?exchange"?\b/i, "DROP SCHEMA"],
  [/\bTRUNCATE\s+(TABLE\s+)?(ONLY\s+)?"?exchange"?\./i, "TRUNCATE"],
  [/\bDELETE\s+FROM\s+(ONLY\s+)?"?exchange"?\./i, "DELETE FROM"],
  [/\bUPDATE\s+(ONLY\s+)?"?exchange"?\./i, "UPDATE"],
  [/\bALTER\s+TABLE\s+(ONLY\s+)?"?exchange"?\.[^\n]*\bDROP\s+COLUMN\b/i, "DROP COLUMN"],
  [/\bALTER\s+TABLE\s+(ONLY\s+)?"?exchange"?\.[^\n]*\bALTER\s+COLUMN\b[^\n]*\bTYPE\s+(?!numeric\s*;|numeric\s*$)/i, "ALTER COLUMN TYPE"],
];

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

const windowsOf = (lines: string[]) =>
  lines.map((line: string, i: number) => ({
    i,
    raw: line,
    joined: lines.slice(i, i + 3).join(" ").replace(/\s+/g, " ").trim(),
  }));

for (const file of files) {
  const lines = fs.readFileSync(path.join(DIR, file), "utf8").split("\n");

  windowsOf(lines).forEach(({ i, raw, joined }) => {
    if (raw.trim().startsWith("--")) return;
    const line = joined;

    for (const [pattern, label] of DESTRUCTIVE) {
      if (!pattern.test(line)) continue;

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
