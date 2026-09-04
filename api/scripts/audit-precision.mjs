import "#env";
import pg from "pg";
import pool from "#pool";
import { FEATURES, RENAMES, FLOWS } from "./lib/feature-map.ts";

const useProd = process.argv.includes("--prod");
const prod = useProd
  ? new pg.Client({
      connectionString: process.env.PROD_READONLY_DATABASE_URL,
      ssl: { rejectUnauthorized: false },
    })
  : null;
if (prod) await prod.connect();

const shapeQ = async (sql, params = []) => (await pool.query(sql, params)).rows;
const dataQ = async (sql, params = []) =>
  prod ? (await prod.query(sql, params)).rows : (await pool.query(sql, params)).rows;

const describe = async (q, table) => {
  const [schema, name] = table.split(".");
  const rows = await q(
    `SELECT a.attname AS column, format_type(a.atttypid, a.atttypmod) AS type,
            t.typcategory AS category
       FROM pg_attribute a
       JOIN pg_type t ON t.oid = a.atttypid
       JOIN pg_class c ON c.oid = a.attrelid
       JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = $1 AND c.relname = $2 AND a.attnum > 0 AND NOT a.attisdropped`,
    [schema, name]
  );
  return new Map(rows.map((r) => [r.column, r]));
};

const only = process.argv.slice(2).find((a) => !a.startsWith("--"));
const features = only ? { [only]: FEATURES[only] } : FEATURES;
if (only && !FEATURES[only]) {
  console.error(`unknown feature: ${only}\nknown: ${Object.keys(FEATURES).join(", ")}`);
  process.exit(1);
}

const COMPARABLE = new Set(["N", "S", "D"]);
let losses = 0;
let checked = 0;

for (const [feature, sources] of Object.entries(features)) {
  const lines = [];

  for (const [source, targets] of Object.entries(sources)) {
    const src = await describe(dataQ, source);
    if (!src.size) continue;

    const renames = RENAMES[source] ?? {};

    for (const [column, s] of src) {
      const targetName = renames[column] ?? column;
      if (targetName === "-") continue;
      if (!COMPARABLE.has(s.category)) continue;

      for (const target of targets) {
        const dst = await describe(shapeQ, target);
        const t = dst.get(targetName);
        if (!t) continue;
        if (t.category !== s.category) continue;
        if (t.type === s.type) continue;

        const found = await compare(source, column, s, target, targetName, t);
        if (found) lines.push(found);
      }
    }
  }

  for (const [source, targets] of Object.entries(FLOWS[feature] ?? {})) {
    const src = await describe(dataQ, source);
    if (!src.size) continue;
    for (const [target, columns] of Object.entries(targets)) {
      const dst = await describe(shapeQ, target);
      for (const [column, into] of Object.entries(columns)) {
        const s = src.get(column);
        if (!s) continue;
        for (const targetName of [].concat(into)) {
          const t = dst.get(targetName);
          if (!t || t.category !== s.category || t.type === s.type) continue;
          const found = await compare(source, column, s, target, targetName, t);
          if (found) lines.push(found);
        }
      }
    }
  }

  if (lines.length) {
    console.log(`\n${feature}`);
    for (const l of lines) console.log(l);
  }
}

async function compare(source, column, s, target, targetName, t) {
  checked++;
  const [ss, st] = source.split(".");
  let row;
  try {
    [row] = await dataQ(
      `SELECT count(*) FILTER (
                WHERE (${quote(column)})::${t.type} IS DISTINCT FROM ${quote(column)}
              )::int AS changed,
              count(${quote(column)})::int AS populated
         FROM ${quote(ss)}.${quote(st)}`
    );
  } catch (err) {
    losses++;
    return (
      `   ${source}.${column} -> ${target}.${targetName}\n` +
      `      ${s.type} -> ${t.type}  CAST FAILS: ${err.message.split("\n")[0]}`
    );
  }
  if (row.changed === 0) return null;
  losses++;
  const sample = await sampleOf(ss, st, column, t.type);
  return (
    `   ${source}.${column} -> ${target}.${targetName}\n` +
    `      ${s.type} -> ${t.type}  changes ${row.changed} of ${row.populated} populated rows` +
    (sample ? `\n      e.g. ${sample.from} stored as ${sample.to}` : "")
  );
}

async function sampleOf(schema, table, column, type) {
  const rows = await dataQ(
    `SELECT ${quote(column)}::text AS "from", (${quote(column)})::${type}::text AS "to"
       FROM ${quote(schema)}.${quote(table)}
      WHERE ${quote(column)} IS NOT NULL
        AND (${quote(column)})::${type} IS DISTINCT FROM ${quote(column)}
      LIMIT 1`
  );
  return rows[0] ?? null;
}

function quote(ident) {
  if (!/^[a-z_][a-z0-9_]*$/.test(ident)) throw new Error(`unsafe identifier: ${ident}`);
  return `"${ident}"`;
}

const PRECISION_FLOOR = Number(process.env.AUDIT_PRECISION_FLOOR ?? (only ? 1 : 45));
if (checked < PRECISION_FLOOR) {
  console.error(
    `audit:precision examined only ${checked} type difference(s), expected at least ` +
      `${PRECISION_FLOOR}. "0 columns would change" from a walk that compared nothing ` +
      `is indistinguishable from "0 columns would change", which is why this refuses.`
  );
  process.exit(1);
}

const where = useProd ? "production" : "dev";
console.log(
  `\n${losses} column(s) whose value the target type would change  ` +
    `(${checked} type differences examined against ${where})`
);
if (!useProd) console.log("re-run with --prod; dev's values prove nothing about production's");
await prod?.end();
await pool.end();
process.exit(losses > 0 ? 1 : 0);
