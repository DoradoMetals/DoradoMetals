// Plans a feature's migration by starting from the target schema.
//
// The wrong way round - and how the first few migrations were done - is to take
// an exchange table and look for its counterpart. That only ever finds copies,
// and every remaining feature is a transformation: columns that move to a
// different table, tables that split, data that has no source at all.
//
// This starts from the new schema and works backwards, reporting everything
// that has to be true before the feature can move:
//
//   - the tables in the target schema, and what they need from other schemas
//   - the exchange tables that appear to feed them, matched by name and shape
//   - target columns with no obvious source, which are the transformations
//   - source columns with no obvious home, which are the data-loss risks
//   - which API features currently read the source tables, so the blast radius
//     is known before any code is written
//
// Read-only.
//
//   node scripts/plan-migration.mjs products
//   node scripts/plan-migration.mjs orders shipping
import "#env";
import fs from "node:fs";
import path from "node:path";
import pool from "#pool";

const FEATURES_DIR = path.join(import.meta.dirname, "..", "features");

const targets = process.argv.slice(2);
if (!targets.length) {
  console.error("usage: plan-migration.mjs <schema> [schema...]");
  process.exit(1);
}

const q = async (sql, params = []) => (await pool.query(sql, params)).rows;

async function columnsOf(schema, table) {
  return q(
    `SELECT column_name, data_type, is_nullable, column_default
     FROM information_schema.columns
     WHERE table_schema = $1 AND table_name = $2 ORDER BY ordinal_position`,
    [schema, table]
  );
}

// Which API features contain SQL naming this table.
function featuresReading(table) {
  const hits = [];
  for (const feature of fs.readdirSync(FEATURES_DIR)) {
    const dir = path.join(FEATURES_DIR, feature);
    if (!fs.statSync(dir).isDirectory()) continue;

    const files = [];
    const walk = (d) => {
      for (const e of fs.readdirSync(d, { withFileTypes: true })) {
        const full = path.join(d, e.name);
        if (e.isDirectory()) walk(full);
        else if (/\.(js|ts)$/.test(e.name)) files.push(full);
      }
    };
    walk(dir);

    const pattern = new RegExp(`exchange\\.${table}\\b`);
    if (files.some((f) => pattern.test(fs.readFileSync(f, "utf8")))) {
      hits.push(feature);
    }
  }
  return hits;
}

for (const schema of targets) {
  const tables = await q(
    `SELECT table_name FROM information_schema.tables
     WHERE table_schema = $1 AND table_type = 'BASE TABLE' ORDER BY table_name`,
    [schema]
  );

  if (!tables.length) {
    console.log(`${schema}: no such schema, or no tables\n`);
    continue;
  }

  console.log(`=== ${schema} ===\n`);

  for (const { table_name } of tables) {
    const target = await columnsOf(schema, table_name);
    const targetNames = target.map((c) => c.column_name);

    // What this table needs from elsewhere.
    const deps = await q(
      `SELECT DISTINCT ccu.table_schema s, ccu.table_name t
       FROM information_schema.table_constraints tc
       JOIN information_schema.constraint_column_usage ccu
         ON ccu.constraint_name = tc.constraint_name
       WHERE tc.constraint_type = 'FOREIGN KEY'
         AND tc.table_schema = $1 AND tc.table_name = $2
         AND NOT (ccu.table_schema = $1 AND ccu.table_name = $2)
       ORDER BY 1, 2`,
      [schema, table_name]
    );

    // The likeliest source: same name in exchange, else a table sharing most
    // column names. Named as a guess, because it is one.
    const sameName = await columnsOf("exchange", table_name);
    let source = sameName.length ? table_name : null;
    if (!source) {
      const candidates = await q(
        `SELECT table_name FROM information_schema.tables
         WHERE table_schema = 'exchange' AND table_type = 'BASE TABLE'`
      );
      let best = { name: null, overlap: 0 };
      for (const c of candidates) {
        const cols = (await columnsOf("exchange", c.table_name)).map((x) => x.column_name);
        const overlap = cols.filter((x) => targetNames.includes(x)).length;
        if (overlap > best.overlap) best = { name: c.table_name, overlap };
      }
      if (best.overlap >= 3) source = best.name;
    }

    const sourceCols = source ? (await columnsOf("exchange", source)).map((c) => c.column_name) : [];
    const noSource = targetNames.filter((c) => !sourceCols.includes(c));
    const noHome = sourceCols.filter((c) => !targetNames.includes(c));

    const rows = await q(`SELECT count(*)::int c FROM "${schema}"."${table_name}"`);
    const sourceRows = source
      ? (await q(`SELECT count(*)::int c FROM exchange."${source}"`))[0].c
      : null;

    console.log(`${schema}.${table_name}  (${rows[0].c} rows)`);
    console.log(`   likely source:   ${source ? `exchange.${source} (${sourceRows} rows)` : "NONE - new table, needs data from somewhere else"}`);
    if (deps.length) {
      console.log(`   depends on:      ${deps.map((d) => `${d.s}.${d.t}`).join(", ")}`);
    }
    if (noSource.length) {
      console.log(`   no source for:   ${noSource.join(", ")}`);
    }
    if (noHome.length) {
      console.log(`   NO HOME FOR:     ${noHome.join(", ")}   <- transformation or data loss`);
    }
    if (source) {
      const readers = featuresReading(source);
      console.log(`   API features reading exchange.${source}: ${readers.join(", ") || "none"}`);
    }
    console.log();
  }
}

await pool.end();
