import "#env";
import pg from "pg";
import pool from "#pool";

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

const only = process.argv.slice(2).find((a) => !a.startsWith("--"));
const features = only ? { [only]: FEATURES[only] } : FEATURES;
if (only && !FEATURES[only]) {
  console.error(`unknown feature: ${only}\nknown: ${Object.keys(FEATURES).join(", ")}`);
  process.exit(1);
}

const globalTargets = new Map();
for (const sources of Object.values(FEATURES)) {
  for (const [source, targets] of Object.entries(sources)) {
    if (!globalTargets.has(source)) globalTargets.set(source, new Set());
    for (const t of targets) globalTargets.get(source).add(t);
  }
}

const globalColumns = new Map();
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

const gapSet = new Set();
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
      if (elsewhere.has(mapped ?? col)) continue;
      if (DELIBERATE[`${source}.${col}`]) continue;

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

const NOT_A_FEATURE = {
  schema_migrations: "the migration ledger itself; it stays in exchange by design",
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
