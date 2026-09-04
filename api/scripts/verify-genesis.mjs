import "#env";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import pool from "#pool";

const PREFIX = "zz_genesis_";
const SCHEMAS = [
  "auth", "fulfillments", "leads", "media", "metals", "orders",
  "organizations", "payments", "places", "products", "rates",
  "refiners", "reviews", "shipping", "spots", "tax",
];

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

  const committed = fs.readFileSync(
    path.join(import.meta.dirname, "..", "migrations", "000_genesis_schema.sql"),
    "utf8"
  );
  const regenerated = execFileSync(
    process.execPath,
    [path.join(import.meta.dirname, "dump-schema.mjs"), "--stdout"],
    { encoding: "utf8", maxBuffer: 64 * 1024 * 1024 }
  );
  const qualify = (text) => {
    let table = "(top level)";
    return text.split("\n").map((line) => {
      const opens = line.match(/^CREATE (?:TABLE|VIEW)(?: IF NOT EXISTS)? ([\w.]+)/);
      if (opens) table = opens[1];
      else if (line === ");") table = "(top level)";
      return `${table}\u0000${line}`;
    });
  };
  const unqualify = (k) => {
    const [table, line] = k.split("\u0000");
    return table === "(top level)" ? line : `${line}   [${table}]`;
  };

  if (committed !== regenerated) {
    const a = qualify(committed);
    const b = qualify(regenerated);
    const inB = new Set(b);
    const inA = new Set(a);
    const drift = [
      ...a.filter((l) => !inB.has(l)).map((l) => `  committed: ${unqualify(l)}`),
      ...b.filter((l) => !inA.has(l)).map((l) => `  dev has:   ${unqualify(l)}`),
    ];
    note(
      `000_genesis_schema.sql is stale - it does not match what dev now is.\n` +
        drift.slice(0, 20).join("\n") +
        (drift.length > 20 ? `\n  ... and ${drift.length - 20} more` : "") +
        `\n  run: pnpm --filter @dorado/api dump:schema`
    );
  }

  console.log(failures ? `\n${failures} difference(s)` : "\nidentical to dev, and the committed genesis matches");
} finally {
  await client.query("ROLLBACK");
  client.release();
  await pool.end();
}

process.exit(failures ? 1 : 0);
