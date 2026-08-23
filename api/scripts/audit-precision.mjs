// Which columns would have their value changed by the type they land in.
//
// audit-coverage asks whether a column has anywhere to go. This asks the next
// question: can what it lands in hold the value unchanged? A column can exist
// in the target, match by name, pass every row-count check, and still quietly
// round the value on the way in.
//
// Written after exactly that. orders.items declared purity numeric(4,3) while
// exchange.products declares it unconstrained, so a .9999 fine gold coin was
// stored as 1.000 - a purity that does not exist. Three rows in dev, eighteen
// products in production. verify:parity could not see it, because orders is not
// a one-to-one pair; audit:coverage could not either, because the column was
// there. Nothing was looking at whether the value survived the trip.
//
// The check is a cast, not a comparison of type names: for every source column
// with a same-named (or declared-renamed) target column in the same type
// family, count the rows where casting the value to the target's declared type
// changes it. A type that is merely different is not a problem; a type that
// changes the data is.
//
// Run it against production. Dev's data cannot tell you what production holds -
// dev happens to contain three of these and production eighteen, and either
// number could have been zero.
//
// Read-only. Safe against production.
//
//   node scripts/audit-precision.mjs           against dev
//   node scripts/audit-precision.mjs --prod    against production
//   node scripts/audit-precision.mjs orders    one feature
import "#env";
import pg from "pg";
import pool from "#db";
import { FEATURES, RENAMES, FLOWS } from "./lib/feature-map.mjs";

const useProd = process.argv.includes("--prod");
const prod = useProd
  ? new pg.Client({
      connectionString: process.env.PROD_READONLY_DATABASE_URL,
      ssl: { rejectUnauthorized: false },
    })
  : null;
if (prod) await prod.connect();

// Shape always comes from dev - the new schema exists nowhere else. Values come
// from whichever database is being audited.
const shapeQ = async (sql, params = []) => (await pool.query(sql, params)).rows;
const dataQ = async (sql, params = []) =>
  prod ? (await prod.query(sql, params)).rows : (await pool.query(sql, params)).rows;

// format_type gives the declared type with its modifier - numeric(4,3) rather
// than "numeric" - which is the whole point here. typcategory keeps the
// comparison inside one family, so a text column that becomes a uuid foreign
// key is not reported as a precision loss; that is a transformation, and it is
// audit-coverage's business, not this one's.
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
    if (!src.size) continue; // table absent from the database being audited

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
        if (t.type === s.type) continue; // same declared type, nothing to lose

        const found = await compare(source, column, s, target, targetName, t);
        if (found) lines.push(found);
      }
    }
  }

  // Declared value flows, which FEATURES cannot express.
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

// One source column against one target column: does casting change any value?
async function compare(source, column, s, target, targetName, t) {
  checked++;
  const [ss, st] = source.split(".");
  let row;
  try {
    [row] = await dataQ(
      // No WHERE: the denominator has to be every populated row, not the rows
      // that already failed. Casting null yields null, and null IS DISTINCT
      // FROM null is false, so nulls never count as changed.
      `SELECT count(*) FILTER (
                WHERE (${quote(column)})::${t.type} IS DISTINCT FROM ${quote(column)}
              )::int AS changed,
              count(${quote(column)})::int AS populated
         FROM ${quote(ss)}.${quote(st)}`
    );
  } catch (err) {
    // A cast that throws is worse than one that rounds: the migration does not
    // silently lose the value, it aborts. Either way the column cannot hold
    // what the source holds.
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

const where = useProd ? "production" : "dev";
console.log(
  `\n${losses} column(s) whose value the target type would change  ` +
    `(${checked} type differences examined against ${where})`
);
if (!useProd) console.log("re-run with --prod; dev's values prove nothing about production's");
await prod?.end();
await pool.end();
process.exit(losses > 0 ? 1 : 0);
