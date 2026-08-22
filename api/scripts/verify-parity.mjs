// Proves a schema migration has not lost data.
//
// Run before and after any migration that touches a table pair, and before
// promoting a feature's *_SOURCE switch. It answers one question in three
// parts, over every shared column rather than a sample:
//
//   1. is every source row present in the target        (nothing dropped)
//   2. does every shared column agree, row by row       (nothing corrupted)
//   3. does the target hold rows the source does not    (nothing about to be
//                                                        overwritten by a
//                                                        backfill re-run)
//
// Part 3 is the one that matters after a switch has been promoted. Once a
// feature reads and writes the new schema, the old one stops being updated, and
// re-running a backfill would overwrite the new schema's rows with stale
// values. If this reports target-only rows, DO NOT run a backfill.
//
// Read-only. Safe against production.
//
//   node scripts/verify-parity.mjs                     all known pairs
//   node scripts/verify-parity.mjs exchange.leads core.leads
import "dotenv/config";
import pool from "#db";

const PAIRS = [
  ["exchange.leads", "core.leads"],
  ["exchange.rates", "core.rates"],
];

const split = (q) => {
  const [schema, table] = q.split(".");
  return { schema, table };
};

async function columnsOf(schema, table) {
  const { rows } = await pool.query(
    `SELECT column_name FROM information_schema.columns
     WHERE table_schema = $1 AND table_name = $2 ORDER BY ordinal_position`,
    [schema, table]
  );
  return rows.map((r) => r.column_name);
}

async function verify(from, to) {
  const a = split(from);
  const b = split(to);

  const [ca, cb] = [await columnsOf(a.schema, a.table), await columnsOf(b.schema, b.table)];
  if (!ca.length || !cb.length) {
    console.log(`${from} -> ${to}\n   MISSING TABLE\n`);
    return false;
  }

  const shared = ca.filter((c) => cb.includes(c));
  const orphanColumns = ca.filter((c) => !cb.includes(c));
  const left = shared.map((c) => `e."${c}"`).join(",");
  const right = shared.map((c) => `t."${c}"`).join(",");

  const { rows } = await pool.query(`
    SELECT
      (SELECT count(*)::int FROM ${from}) source_rows,
      (SELECT count(*)::int FROM ${to}) target_rows,
      (SELECT count(*)::int FROM ${from} e
        WHERE NOT EXISTS (SELECT 1 FROM ${to} t WHERE t.id = e.id)) missing_from_target,
      (SELECT count(*)::int FROM ${to} t
        WHERE NOT EXISTS (SELECT 1 FROM ${from} e WHERE e.id = t.id)) only_in_target,
      (SELECT count(*)::int FROM ${from} e JOIN ${to} t USING (id)
        WHERE (${left}) IS DISTINCT FROM (${right})) differing
  `);
  const r = rows[0];

  const lost = r.missing_from_target > 0 || r.differing > 0 || orphanColumns.length > 0;
  const ahead = r.only_in_target > 0;

  console.log(`${from} -> ${to}`);
  console.log(`   columns compared:     ${shared.length} of ${ca.length}`);
  console.log(`   rows:                 ${r.source_rows} source, ${r.target_rows} target`);
  console.log(`   missing from target:  ${r.missing_from_target}`);
  console.log(`   differing values:     ${r.differing}`);
  console.log(`   only in target:       ${r.only_in_target}`);

  if (orphanColumns.length) {
    console.log(`   DATA LOSS RISK: no home in target for ${orphanColumns.join(", ")}`);
  }
  if (lost) {
    console.log(`   >> NOT SAFE: the target does not contain everything the source has`);
  }
  if (ahead) {
    console.log(`   >> DO NOT BACKFILL: the target holds ${r.only_in_target} row(s) the source`);
    console.log(`      does not. A backfill would overwrite them with stale values.`);
    console.log(`      This is expected once a *_SOURCE switch has been promoted past dual.`);
  }
  if (!lost && !ahead) {
    console.log(`   ok: identical`);
  }
  console.log();
  return !lost && !ahead;
}

const [from, to] = process.argv.slice(2);
const pairs = from && to ? [[from, to]] : PAIRS;

let allClean = true;
for (const [a, b] of pairs) {
  if (!(await verify(a, b))) allClean = false;
}

console.log(allClean ? "all pairs identical" : "review the warnings above before migrating");
if (!allClean) process.exitCode = 1;
await pool.end();
