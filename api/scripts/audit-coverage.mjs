// Which populated columns in exchange have nowhere to go in the new schema.
//
// Written after orders turned out to be missing twenty-one columns of live
// data, found one repo function at a time. Row counts had matched, the shapes
// looked plausible, and the gaps only showed up when something tried to read a
// column that was not there. That is far too late, and doing it by hand for the
// thirteen features still to move would find the same thing just as slowly.
//
// So: for each source table, every column that holds a value in at least one
// row, checked against every table the feature maps onto. A column counts as
// having a home if some target table has one of the same name, or a rename is
// declared below. Anything left is either a rename nobody wrote down or data
// with no destination.
//
// It cannot know whether a mapping is *correct* - only whether one exists. It
// is a floor, not a ceiling.
//
// Read-only.
//
//   node scripts/audit-coverage.mjs            every feature
//   node scripts/audit-coverage.mjs orders     one
import "#env";
import pg from "pg";
import pool from "#db";

// Shape comes from dev, because the new schema exists nowhere else. Population
// comes from production when --prod is passed, because dev's row counts prove
// nothing about which columns actually hold data.
//
// That distinction is not academic. This audit skips any column that is null on
// every row, on the grounds that an empty column is a question for whoever owns
// the feature rather than a blocker. Run against dev, that silently excused
// every column dev happens not to use - and dev had no bank details at all
// where production has fourteen. A column populated only in production was
// invisible to this tool until now.
const useProd = process.argv.includes("--prod");
const prod = useProd
  ? new pg.Client({
      connectionString: process.env.PROD_READONLY_DATABASE_URL,
      ssl: { rejectUnauthorized: false },
    })
  : null;
if (prod) await prod.connect();

import { FEATURES, RENAMES, DELIBERATE, BLOCKED } from "./lib/feature-map.mjs";

const q = async (sql, params = []) => (await pool.query(sql, params)).rows;

// The feature name is the first argument that is not a flag.
const only = process.argv.slice(2).find((a) => !a.startsWith("--"));
const features = only ? { [only]: FEATURES[only] } : FEATURES;
if (only && !FEATURES[only]) {
  console.error(`unknown feature: ${only}\nknown: ${Object.keys(FEATURES).join(", ")}`);
  process.exit(1);
}

let gaps = 0;

for (const [feature, sources] of Object.entries(features)) {
  const lines = [];

  for (const [source, targets] of Object.entries(sources)) {
    const [ss, st] = source.split(".");
    const cols = await q(
      `SELECT column_name FROM information_schema.columns
       WHERE table_schema = $1 AND table_name = $2 ORDER BY ordinal_position`,
      [ss, st]
    );
    if (!cols.length) {
      lines.push(`   ${source} does not exist`);
      continue;
    }

    const available = new Set();
    for (const t of targets) {
      const [ts, tt] = t.split(".");
      for (const c of await q(
        `SELECT column_name FROM information_schema.columns
         WHERE table_schema = $1 AND table_name = $2`,
        [ts, tt]
      )) {
        available.add(c.column_name);
      }
    }

    const renames = RENAMES[source] ?? {};

    for (const { column_name: col } of cols) {
      const mapped = renames[col];
      if (mapped === "-") continue;
      if (available.has(mapped ?? col)) continue;
      if (DELIBERATE[`${source}.${col}`]) continue;

      // Only report it if it actually holds something. A column that is null on
      // every row is a question for whoever owns the feature, not a blocker for
      // the migration - but "every row" has to mean production's rows.
      const countSql = `SELECT count(*) FILTER (WHERE "${col}" IS NOT NULL)::int n, count(*)::int total FROM "${ss}"."${st}"`;
      const [{ n, total }] = prod ? (await prod.query(countSql)).rows : await q(countSql);
      if (n === 0) continue;

      const blocked = BLOCKED[`${source}.${col}`];
      gaps++;
      lines.push(
        `   ${source}.${col}`.padEnd(52) +
          `${n} of ${total} rows populated` +
          (blocked ? `   BLOCKED - ${blocked}` : "")
      );
    }
  }

  if (lines.length) {
    console.log(`\n=== ${feature} ===`);
    console.log(lines.join("\n"));
  }
}

console.log(
  gaps
    ? `\n${gaps} populated column(s) with no home in the new schema` +
        `  (population counted against ${useProd ? "PRODUCTION" : "dev"})`
    : `\nevery populated column has somewhere to go` +
        `  (population counted against ${useProd ? "PRODUCTION" : "dev"})`
);

if (!useProd) {
  console.log("re-run with --prod to count against production, where dev's nulls prove nothing");
}

if (prod) await prod.end();
await pool.end();
process.exit(0);
