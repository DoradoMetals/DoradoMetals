// Proves 000_genesis_schema.sql actually builds the schema it claims to.
//
// The genesis migration is a no-op against dev, which is exactly what makes it
// hard to trust: every statement is guarded, so running it here tells you
// nothing about whether it would work on an empty database. The only real test
// is to run it where the schemas do not exist.
//
// Which is what this does, without needing a second database. It regenerates
// the DDL with every schema renamed - orders becomes zz_orders and so on -
// runs that inside a transaction, compares the tables it built against the
// real ones column by column, and rolls back. DDL in Postgres is transactional,
// so nothing survives: the schemas exist for the length of the check and are
// gone at the end of it. exchange is never written to at all.
//
//   node scripts/verify-genesis.mjs
//
// Exits non-zero on any difference.
import "#env";
import { execFileSync } from "node:child_process";
import path from "node:path";
import pool from "#db";

const PREFIX = "zz_genesis_";
const SCHEMAS = [
  "auth", "fulfillments", "leads", "media", "metals", "orders",
  "organizations", "payments", "places", "products", "rates",
  "refiners", "reviews", "shipping", "spots", "tax",
];

// Strips the prefix wherever it appears so a definition built under zz_orders
// can be compared against the one under orders.
const unprefix = (s) => (s == null ? s : String(s).split(PREFIX).join(""));

const client = await pool.connect();
let failures = 0;
const note = (msg) => {
  failures++;
  console.log(`  DIFF  ${msg}`);
};

try {
  const sql = execFileSync(
    process.execPath,
    [path.join(import.meta.dirname, "dump-schema.mjs"), "--stdout", "--prefix", PREFIX],
    { encoding: "utf8", maxBuffer: 64 * 1024 * 1024 }
  );

  await client.query("BEGIN");

  // If any of these already exist the comparison would be meaningless, so
  // check before building rather than discovering it afterwards.
  const { rows: existing } = await client.query(
    `SELECT nspname FROM pg_namespace WHERE nspname LIKE $1`,
    [`${PREFIX}%`]
  );
  if (existing.length) {
    console.error(`scratch schemas already exist: ${existing.map((r) => r.nspname).join(", ")}`);
    process.exit(1);
  }

  console.log(`building ${SCHEMAS.length} schemas from nothing...`);
  await client.query(sql);

  // Running it twice proves the guards work - the second pass must change
  // nothing rather than failing on an object that already exists.
  console.log("re-running to confirm it is idempotent...");
  await client.query(sql);

  for (const schema of SCHEMAS) {
    const built = `${PREFIX}${schema}`;

    const relations = async (nsp) =>
      (await client.query(
        `SELECT c.relname AS name, c.relkind AS kind
         FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
         WHERE n.nspname = $1 AND c.relkind IN ('r', 'v') ORDER BY 1`,
        [nsp]
      )).rows;

    const [a, b] = [await relations(schema), await relations(built)];
    const names = (rs) => rs.map((r) => `${r.kind}:${r.name}`);
    for (const missing of names(a).filter((x) => !names(b).includes(x))) {
      note(`${schema}: genesis did not create ${missing}`);
    }
    for (const extra of names(b).filter((x) => !names(a).includes(x))) {
      note(`${schema}: genesis created ${extra}, which dev does not have`);
    }

    for (const rel of a.filter((r) => names(b).includes(`${r.kind}:${r.name}`))) {
      const columns = async (nsp) =>
        (await client.query(
          `SELECT a.attname AS name, format_type(a.atttypid, a.atttypmod) AS type,
                  a.attnotnull AS not_null, a.attidentity AS identity,
                  pg_get_expr(d.adbin, d.adrelid) AS default_expr
           FROM pg_attribute a
           JOIN pg_class c ON c.oid = a.attrelid
           JOIN pg_namespace n ON n.oid = c.relnamespace
           LEFT JOIN pg_attrdef d ON d.adrelid = a.attrelid AND d.adnum = a.attnum
           WHERE n.nspname = $1 AND c.relname = $2 AND a.attnum > 0 AND NOT a.attisdropped
           ORDER BY a.attnum`,
          [nsp, rel.name]
        )).rows;

      const [ca, cb] = [await columns(schema, rel.name), await columns(built, rel.name)];
      const fmt = (c) =>
        `${c.name} ${unprefix(c.type)}${c.not_null ? " NOT NULL" : ""}` +
        `${c.identity ? ` IDENTITY(${c.identity})` : ""}` +
        `${c.default_expr ? ` DEFAULT ${unprefix(c.default_expr)}` : ""}`;

      const [fa, fb] = [ca.map(fmt), cb.map(fmt)];
      if (fa.join("\n") !== fb.join("\n")) {
        for (const x of fa.filter((v) => !fb.includes(v))) note(`${schema}.${rel.name}: expected  ${x}`);
        for (const x of fb.filter((v) => !fa.includes(v))) note(`${schema}.${rel.name}: got       ${x}`);
      }

      if (rel.kind !== "r") continue;

      const defs = async (nsp) =>
        (await client.query(
          `SELECT con.conname AS name, pg_get_constraintdef(con.oid) AS def
           FROM pg_constraint con
           JOIN pg_class c ON c.oid = con.conrelid
           JOIN pg_namespace n ON n.oid = c.relnamespace
           WHERE n.nspname = $1 AND c.relname = $2 ORDER BY con.conname, 2`,
          [nsp, rel.name]
        )).rows.map((r) => `${r.name} ${unprefix(r.def)}`);

      const [da, db] = [await defs(schema, rel.name), await defs(built, rel.name)];
      for (const x of da.filter((v) => !db.includes(v))) note(`${schema}.${rel.name}: missing constraint ${x}`);
      for (const x of db.filter((v) => !da.includes(v))) note(`${schema}.${rel.name}: extra constraint ${x}`);

      const idx = async (nsp) =>
        (await client.query(
          `SELECT pg_get_indexdef(i.indexrelid) AS def
           FROM pg_index i
           JOIN pg_class c ON c.oid = i.indrelid
           JOIN pg_namespace n ON n.oid = c.relnamespace
           WHERE n.nspname = $1 AND c.relname = $2`,
          [nsp, rel.name]
        )).rows.map((r) => unprefix(r.def)).sort();

      const [ia, ib] = [await idx(schema, rel.name), await idx(built, rel.name)];
      for (const x of ia.filter((v) => !ib.includes(v))) note(`${schema}.${rel.name}: missing index ${x}`);
      for (const x of ib.filter((v) => !ia.includes(v))) note(`${schema}.${rel.name}: extra index ${x}`);
    }
  }

  // Enums and functions are schema-level rather than per-table.
  const enums = async () =>
    (await client.query(
      `SELECT n.nspname AS schema, t.typname AS name,
              array_agg(e.enumlabel::text ORDER BY e.enumsortorder)::text AS labels
       FROM pg_type t
       JOIN pg_namespace n ON n.oid = t.typnamespace
       JOIN pg_enum e ON e.enumtypid = t.oid
       WHERE n.nspname = ANY($1) OR n.nspname = ANY($2)
       GROUP BY 1, 2`,
      [SCHEMAS, SCHEMAS.map((s) => PREFIX + s)]
    )).rows;

  const es = await enums();
  for (const s of SCHEMAS) {
    const real = es.filter((e) => e.schema === s).map((e) => `${e.name} ${e.labels}`).sort();
    const test = es.filter((e) => e.schema === PREFIX + s).map((e) => `${e.name} ${e.labels}`).sort();
    for (const x of real.filter((v) => !test.includes(v))) note(`${s}: missing type ${x}`);
    for (const x of test.filter((v) => !real.includes(v))) note(`${s}: extra type ${x}`);
  }

  const fns = async (nsps) =>
    (await client.query(
      `SELECT n.nspname AS schema, p.proname AS name, pg_get_functiondef(p.oid) AS def
       FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
       WHERE n.nspname = ANY($1)`,
      [nsps]
    )).rows.map((r) => unprefix(r.def));

  const [fa, fb] = [await fns(SCHEMAS), await fns(SCHEMAS.map((s) => PREFIX + s))];
  for (const x of fa.filter((v) => !fb.includes(v))) note(`missing function:\n${x}`);
  for (const x of fb.filter((v) => !fa.includes(v))) note(`extra function:\n${x}`);

  const counts = await client.query(
    `SELECT count(*) FILTER (WHERE c.relkind='r')::int tables,
            count(*) FILTER (WHERE c.relkind='v')::int views
     FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
     WHERE n.nspname LIKE $1`,
    [`${PREFIX}%`]
  );

  console.log(
    `\nbuilt ${counts.rows[0].tables} tables and ${counts.rows[0].views} views from an empty schema`
  );
  console.log(failures ? `\n${failures} difference(s)` : "\nidentical to dev");
} finally {
  // Nothing this script did survives, whether it passed, failed or threw.
  await client.query("ROLLBACK");
  client.release();
  await pool.end();
}

process.exit(failures ? 1 : 0);
