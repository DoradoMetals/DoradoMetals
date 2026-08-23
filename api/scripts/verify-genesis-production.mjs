// Proves 000_genesis_schema.sql can build PRODUCTION, not just an empty database.
//
// verify-genesis.mjs builds every schema from nothing and compares it against
// dev. That is the right check for a fresh database and it is the wrong check
// for the only database that matters, because production is not fresh.
//
// Production holds nine of the sixteen schemas already. They were built
// directly in January and no migration has ever run against them, so they sit
// in January's shape - measured 2026-08-22, fifty columns and two tables behind
// dev. Genesis creates everything with CREATE TABLE IF NOT EXISTS and declares
// `-- baseline: 002-049`, so against production it would skip every table that
// already exists and then stamp forty-eight migrations as applied without
// running them. The columns those migrations added would never appear, and the
// backfills would write into a shape that cannot hold them.
//
// `IF NOT EXISTS` is invisible when there is nothing there, which is precisely
// why building from empty could never catch this.
//
// So this check starts from production's real shape:
//
//   1. read production's tables and columns, read-only
//   2. in dev, inside a transaction: build genesis into prefixed schemas
//   3. reshape those copies to match production - drop what production lacks
//   4. run genesis again, which is what a production run would do
//   5. compare against dev, and report anything genesis failed to restore
//   6. roll back
//
// Everything happens in throwaway `zz_prodshape_` schemas inside a transaction
// that is rolled back. Production is only ever read from, and `exchange` is
// never touched at all.
//
//   node scripts/verify-genesis-production.mjs
//
// Exits non-zero if genesis would leave production short of dev.
import "#env";
import { execFileSync } from "node:child_process";
import path from "node:path";
import pg from "pg";
import pool from "#db";

const PREFIX = "zz_prodshape_";

// The nine production already has. The other seven it does not have at all,
// and genesis creates those the same way it creates them on an empty database -
// which verify-genesis.mjs already covers.
const SCHEMAS = [
  "auth", "fulfillments", "orders", "payments",
  "places", "refiners", "shipping", "tax",
];

const unprefix = (s) => (s == null ? s : String(s).split(PREFIX).join(""));

if (!process.env.PROD_READONLY_DATABASE_URL) {
  console.error("PROD_READONLY_DATABASE_URL is not set - this check needs production's shape");
  process.exit(1);
}

// Nothing here may ever address a real schema. Every generated statement is
// checked against the prefix before it is sent.
const guard = (sql) => {
  const targets = [...sql.matchAll(/\b(?:TABLE|SCHEMA)\s+(?:IF EXISTS\s+)?([a-z_]+)\./gi)];
  for (const [, nsp] of targets) {
    if (!nsp.startsWith(PREFIX)) {
      throw new Error(`refusing to run a statement against a real schema: ${sql.slice(0, 120)}`);
    }
  }
  return sql;
};

const prod = new pg.Client({
  connectionString: process.env.PROD_READONLY_DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});
await prod.connect();

const client = await pool.connect();
let failures = 0;
const note = (msg) => {
  failures++;
  console.log(`  MISSING  ${msg}`);
};

try {
  // What production actually has.
  const { rows: prodCols } = await prod.query(
    `SELECT table_schema AS s, table_name AS t, column_name AS c
     FROM information_schema.columns WHERE table_schema = ANY($1)`,
    [SCHEMAS]
  );
  const prodShape = new Map();
  for (const r of prodCols) {
    const k = `${r.s}.${r.t}`;
    if (!prodShape.has(k)) prodShape.set(k, new Set());
    prodShape.get(k).add(r.c);
  }
  console.log(`production has ${prodShape.size} tables across ${SCHEMAS.length} schemas`);

  const sql = execFileSync(
    process.execPath,
    [path.join(import.meta.dirname, "dump-schema.mjs"), "--stdout", "--prefix", PREFIX],
    { encoding: "utf8", maxBuffer: 64 * 1024 * 1024 }
  );

  await client.query("BEGIN");

  const { rows: existing } = await client.query(
    `SELECT nspname FROM pg_namespace WHERE nspname LIKE $1`,
    [`${PREFIX}%`]
  );
  if (existing.length) {
    console.error(`scratch schemas already exist: ${existing.map((r) => r.nspname).join(", ")}`);
    process.exit(1);
  }

  console.log("building genesis into scratch schemas...");
  await client.query(sql);

  // Now wind those copies back to production's shape. This is the step that
  // makes the check mean something: after it, the scratch schemas are what
  // genesis would actually find on production.
  console.log("reshaping them to match production...");
  let droppedTables = 0;
  let droppedColumns = 0;

  for (const schema of SCHEMAS) {
    const built = `${PREFIX}${schema}`;
    const { rows: tables } = await client.query(
      `SELECT c.relname AS name FROM pg_class c
       JOIN pg_namespace n ON n.oid = c.relnamespace
       WHERE n.nspname = $1 AND c.relkind = 'r' ORDER BY 1`,
      [built]
    );

    for (const { name } of tables) {
      const key = `${schema}.${name}`;
      if (!prodShape.has(key)) {
        await client.query(guard(`DROP TABLE IF EXISTS ${built}.${name} CASCADE`));
        droppedTables++;
        continue;
      }
      const { rows: cols } = await client.query(
        `SELECT a.attname AS name FROM pg_attribute a
         JOIN pg_class c ON c.oid = a.attrelid
         JOIN pg_namespace n ON n.oid = c.relnamespace
         WHERE n.nspname = $1 AND c.relname = $2 AND a.attnum > 0 AND NOT a.attisdropped`,
        [built, name]
      );
      for (const { name: col } of cols) {
        if (prodShape.get(key).has(col)) continue;
        await client.query(guard(`ALTER TABLE ${built}.${name} DROP COLUMN ${col} CASCADE`));
        droppedColumns++;
      }
    }
  }
  console.log(`  production is behind by ${droppedTables} table(s) and ${droppedColumns} column(s)`);

  // This is the production run.
  console.log("running genesis again, as a production migration would...");
  try {
    await client.query(sql);
  } catch (err) {
    // Genesis does not merely skip what it cannot build - it stops.
    //
    // CREATE TABLE IF NOT EXISTS leaves an older table alone, and the ALTER
    // TABLE ADD CONSTRAINT that follows then names a column that table does not
    // have. Postgres has no IF NOT EXISTS for ADD CONSTRAINT, so the statement
    // is an error and the whole migration aborts.
    //
    // That is the safest way for this to be wrong: the runner wraps each
    // migration in a transaction, so production would roll back untouched
    // rather than end up half-built. But it does mean the production migration
    // cannot run at all as things stand.
    console.log("\n  ABORTED  genesis stopped against production's shape:");
    console.log(`           ${err.message}`);
    if (err.where) console.log(`           ${err.where.split("\n")[0].replace(/^SQL statement "/, "").replace(/"$/, "")}`);
    failures++;
    console.log(
      `\nGenesis would abort on production rather than complete.\n` +
      `CREATE TABLE IF NOT EXISTS leaves production's older tables untouched, and\n` +
      `the ADD CONSTRAINT that follows then names a column those tables do not have.\n` +
      `Postgres has no IF NOT EXISTS for ADD CONSTRAINT, so it is a hard error.\n\n` +
      `The fix is for genesis to reconcile an existing table rather than skip it:\n` +
      `an ALTER TABLE ... ADD COLUMN IF NOT EXISTS for every column, emitted before\n` +
      `the constraints. Additive, so it cannot drop what is already there.`
    );
    process.exit(1);
  }

  // Anything still missing is something production would never get.
  console.log("comparing against dev...\n");
  for (const schema of SCHEMAS) {
    const built = `${PREFIX}${schema}`;

    const relations = async (nsp) =>
      (await client.query(
        `SELECT c.relname AS name, c.relkind AS kind FROM pg_class c
         JOIN pg_namespace n ON n.oid = c.relnamespace
         WHERE n.nspname = $1 AND c.relkind IN ('r','v') ORDER BY 1`,
        [nsp]
      )).rows;

    const [a, b] = [await relations(schema), await relations(built)];
    const names = (rs) => rs.map((r) => `${r.kind}:${r.name}`);
    for (const missing of names(a).filter((x) => !names(b).includes(x))) {
      note(`${schema}: ${missing} would not exist on production`);
    }

    for (const rel of a.filter((r) => names(b).includes(`${r.kind}:${r.name}`))) {
      const columns = async (nsp) =>
        (await client.query(
          `SELECT a.attname AS name, format_type(a.atttypid, a.atttypmod) AS type
           FROM pg_attribute a
           JOIN pg_class c ON c.oid = a.attrelid
           JOIN pg_namespace n ON n.oid = c.relnamespace
           WHERE n.nspname = $1 AND c.relname = $2 AND a.attnum > 0 AND NOT a.attisdropped
           ORDER BY a.attname`,
          [nsp, rel.name]
        )).rows;

      const [ca, cb] = [await columns(schema, rel.name), await columns(built, rel.name)];
      const have = new Set(cb.map((c) => c.name));
      for (const c of ca) {
        if (!have.has(c.name)) note(`${schema}.${rel.name}.${c.name} (${unprefix(c.type)})`);
      }
    }
  }
} finally {
  await client.query("ROLLBACK");
  client.release();
  await pool.end();
  await prod.end();
}

if (failures) {
  console.log(
    `\n${failures} object(s) genesis would not build on production.\n` +
    `Genesis skips tables that already exist, so a table in an older shape stays\n` +
    `in that shape - and the baseline marker then records the migrations that\n` +
    `would have fixed it as already applied.`
  );
  process.exit(1);
}
console.log("genesis reproduces dev from production's shape");
