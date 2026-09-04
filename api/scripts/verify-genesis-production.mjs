import "#env";
import { execFileSync } from "node:child_process";
import path from "node:path";
import pg from "pg";
import pool from "#pool";

const PREFIX = "zz_prodshape_";

const SCHEMAS = [
  "auth", "fulfillments", "orders", "payments",
  "places", "refiners", "shipping", "tax",
];

const unprefix = (s) => (s == null ? s : String(s).split(PREFIX).join(""));

if (!process.env.PROD_READONLY_DATABASE_URL) {
  console.error("PROD_READONLY_DATABASE_URL is not set - this check needs production's shape");
  process.exit(1);
}

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

  console.log("running genesis again, as a production migration would...");
  try {
    await client.query(sql);
  } catch (err) {
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
