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
import pool from "#pool";

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

import { FEATURES, RENAMES, DELIBERATE, BLOCKED } from "./lib/feature-map.ts";

const q = async (sql, params = []) => (await pool.query(sql, params)).rows;

// Shape questions go to dev; "how many rows" goes to whichever database is
// under audit, for the same reason the column population counts do.
// Returns null when the table does not exist in the database under audit.
// Production and dev do not hold exactly the same set of exchange tables, and a
// table only dev has is not a reason for the whole audit to abort.
const countIn = async (table) => {
  const client = prod ?? pool;
  try {
    const { rows } = await client.query(`SELECT count(*)::int AS n FROM ${table}`);
    return rows[0].n;
  } catch (err) {
    if (err.code === "42P01") return null;
    throw err;
  }
};

// The feature name is the first argument that is not a flag.
const only = process.argv.slice(2).find((a) => !a.startsWith("--"));
const features = only ? { [only]: FEATURES[only] } : FEATURES;
if (only && !FEATURES[only]) {
  console.error(`unknown feature: ${only}\nknown: ${Object.keys(FEATURES).join(", ")}`);
  process.exit(1);
}

// A COLUMN HAS A HOME IF *ANY* FEATURE PROVIDES ONE, NOT JUST THE ONE BEING
// WALKED.
//
// The loop below is per feature, and `available` used to be built only from the
// feature currently in hand. So a column that another feature already carries
// was still counted as a gap. That is not hypothetical - it reported three:
//
//   exchange.addresses.user_id / name / is_default, 73 of 73 rows in production
//
// under `orders`. And under `orders` that is TRUE and intentional: an order
// snapshots an address without copying whose it was, which is the whole reason
// places.addresses and places.user_addresses are separate tables. But the
// `addresses` feature maps to places.user_addresses, which holds all three
// (name -> label, is_default -> default_shipping). Nothing was homeless.
//
// The summary line then called them "3 populated columns with no home in the
// new schema", which was simply wrong, and wrong in the direction that costs
// the most: a report that cries wolf is one people stop reading, and this one
// exists to be believed the day it finds something real.
//
// So the per-feature grouping stays - it is useful context - but the gap test
// is global. Built once, up front, because the column lists are the same for
// every feature that names the same target.
const globalTargets = new Map(); // source table -> Set of target tables
for (const sources of Object.values(FEATURES)) {
  for (const [source, targets] of Object.entries(sources)) {
    if (!globalTargets.has(source)) globalTargets.set(source, new Set());
    for (const t of targets) globalTargets.get(source).add(t);
  }
}

const globalColumns = new Map(); // source table -> Set of column names anywhere
for (const [source, targets] of globalTargets) {
  const set = new Set();
  for (const t of targets) {
    const [ts, tt] = t.split(".");
    for (const c of await q(
      `SELECT column_name FROM information_schema.columns
       WHERE table_schema = $1 AND table_name = $2`,
      [ts, tt]
    )) {
      set.add(c.column_name);
    }
  }
  globalColumns.set(source, set);
}

// Counted as DISTINCT source.column pairs, not as sightings. Two features can
// map the same source table - orders and addresses both map exchange.addresses
// - so a genuinely missing column was counted once per feature and the summary
// said "6" when three columns were missing. A number that overstates by the
// number of features that happen to mention a table is not a number anyone can
// act on.
const gapSet = new Set();
// What the walk actually looked at, so the floor below can be about the WALK
// rather than about the findings. `gaps` being 0 is the good outcome and is
// also what an empty walk prints.
let columnsWalked = 0;
let tablesWalked = 0;

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

    const elsewhere = globalColumns.get(source) ?? new Set();

    tablesWalked += 1;
    for (const { column_name: col } of cols) {
      columnsWalked += 1;
      const mapped = renames[col];
      if (mapped === "-") continue;
      if (available.has(mapped ?? col)) continue;
      // Covered by some other feature's mapping for the same source table. Not
      // a gap - the data has a home, just not this feature's.
      if (elsewhere.has(mapped ?? col)) continue;
      if (DELIBERATE[`${source}.${col}`]) continue;

      // Only report it if it actually holds something. A column that is null on
      // every row is a question for whoever owns the feature, not a blocker for
      // the migration - but "every row" has to mean production's rows.
      const countSql = `SELECT count(*) FILTER (WHERE "${col}" IS NOT NULL)::int n, count(*)::int total FROM "${ss}"."${st}"`;
      const [{ n, total }] = prod ? (await prod.query(countSql)).rows : await q(countSql);
      if (n === 0) continue;

      const blocked = BLOCKED[`${source}.${col}`];
      gapSet.add(`${source}.${col}`);
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

// Whole tables no feature claims.
//
// Everything above walks the feature map, so it can only report on tables
// somebody already thought about. A table missing from the map entirely is
// invisible to it - and eleven populated ones were, including
// exchange.account_transactions: a customer credit ledger, seventeen rows
// across eight customers totalling $66,999.32 in production, tied to purchase
// and sales orders, with no destination anywhere in the new schema.
//
// The map is the source of truth for what has been decided. This reports what
// has not been.
const NOT_A_FEATURE = {
  schema_migrations: "the migration ledger itself; it stays in exchange by design",
  // Jacob, 2026-08-23: auctions are going away. 067 removed the schema from the
  // new design. The exchange tables are left alone - one draft auction and two
  // items - because dropping from exchange is the one irreversible step and
  // gains nothing. See FOLLOWUPS.
  auctions: "retired, not migrated; the new-schema tables are gone (067)",
  auction_items: "same",
  account: "better-auth's, and auth owns its own cutover - see FOLLOWUPS",
  session: "same",
  verification: "same",
};

const declaredSources = new Set(
  Object.values(FEATURES).flatMap((f) => Object.keys(f))
);
const allTables = await q(
  `SELECT c.relname AS name FROM pg_class c
     JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'exchange' AND c.relkind = 'r' ORDER BY 1`
);

const undeclared = [];
for (const { name } of allTables) {
  if (declaredSources.has(`exchange.${name}`)) continue;
  const n = await countIn(`exchange."${name}"`);
  if (n === null) {
    undeclared.push({ name, n: null, why: `not present in ${useProd ? "production" : "dev"}` });
    continue;
  }
  if (n === 0) continue;
  undeclared.push({ name, n, why: NOT_A_FEATURE[name] });
}

const unexplained = undeclared.filter((t) => !t.why);
if (undeclared.length) {
  console.log(`\n=== tables no feature claims ===`);
  for (const t of undeclared) {
    console.log(
      `   exchange.${t.name}`.padEnd(52) +
        `${t.n === null ? "-" : t.n} rows` +
        (t.why ? `   (${t.why})` : `   UNDECLARED`)
    );
  }
}

// THE FLOOR (D135), AND IT WAS MISSING. lint:script-guards excused this file
// with "a floor guards the walk", and there was no floor in it: the word
// appears once, in the header, meaning something else entirely - "it cannot
// know whether a mapping is CORRECT, only whether one exists. It is a floor,
// not a ceiling." Two senses of one word, one of them load-bearing in an
// excuse that nothing checked (D165's shape).
//
// It matters here more than almost anywhere. This is the audit CLAUDE.md says
// to run before splitting any repo, written because orders had matching row
// counts and twenty-one missing columns; and "every populated column has
// somewhere to go" is exactly what it prints when it walked nothing.
//
// Measured on the run that added this: 331 columns across 44 source tables in
// dev. The count moves as the feature map grows, never down, unless a source
// table is dropped from exchange - which the do-not-lose-data rule forbids.
const COLUMN_FLOOR = Number(process.env.AUDIT_COVERAGE_FLOOR ?? (only ? 1 : 250));
if (columnsWalked < COLUMN_FLOOR) {
  console.error(
    `audit:coverage walked ${columnsWalked} column(s) across ${tablesWalked} table(s), ` +
      `expected at least ${COLUMN_FLOOR}. "every populated column has somewhere to go" ` +
      `is what this prints when it examined nothing, and it is the check that runs ` +
      `before a repo is split.`
  );
  if (prod) await prod.end();
  await pool.end();
  process.exit(1);
}

const gaps = gapSet.size;

console.log(
  gaps
    ? `\n${gaps} populated column(s) with no home in the new schema` +
        `  (population counted against ${useProd ? "PRODUCTION" : "dev"})`
    : `\nevery populated column has somewhere to go` +
        `  (population counted against ${useProd ? "PRODUCTION" : "dev"})`
);

if (unexplained.length) {
  console.log(
    `${unexplained.length} populated table(s) that no feature declares at all: ` +
      unexplained.map((t) => t.name).join(", ")
  );
}

if (!useProd) {
  console.log("re-run with --prod to count against production, where dev's nulls prove nothing");
}

if (prod) await prod.end();
await pool.end();
process.exit(0);
