import "#env";
import pool from "#pool";
import { FEATURES, RENAMES } from "./lib/feature-map.ts";

const indexesOf = async (table) => {
  const [schema, name] = table.split(".");
  const { rows } = await pool.query(
    `SELECT ic.relname AS name,
            i.indisunique AS is_unique,
            i.indisprimary AS is_primary,
            i.indpred IS NOT NULL AS is_partial,
            0 = ANY(i.indkey::int[]) AS has_expression,
            pg_get_indexdef(i.indexrelid) AS def,
            (SELECT array_agg(a.attname::text ORDER BY k.ord)
               FROM unnest(i.indkey::int[]) WITH ORDINALITY AS k(attnum, ord)
               JOIN pg_attribute a
                 ON a.attrelid = i.indrelid AND a.attnum = k.attnum
              WHERE k.ord <= i.indnkeyatts) AS cols
       FROM pg_index i
       JOIN pg_class c ON c.oid = i.indrelid
       JOIN pg_class ic ON ic.oid = i.indexrelid
       JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = $1 AND c.relname = $2`,
    [schema, name]
  );
  return rows;
};

const columnsOf = async (table) => {
  const [schema, name] = table.split(".");
  const { rows } = await pool.query(
    `SELECT a.attname AS column
       FROM pg_attribute a
       JOIN pg_class c ON c.oid = a.attrelid
       JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = $1 AND c.relname = $2
        AND a.attnum > 0 AND NOT a.attisdropped`,
    [schema, name]
  );
  return new Set(rows.map((r) => r.column));
};

const ACCEPTED = {
  purchase_orders_order_number_key:
    "nothing looks an order up by number alone - orders.orders merged purchase " +
    "and sales orders and is unique on (direction, number), which every caller " +
    "supplies. The uniqueness half of this is audit:constraints' and it reports it.",
};

const leadsWith = (col, idx) => idx.cols && idx.cols[0] === col;
const isPrefix = (want, have) =>
  want.length <= have.length && want.every((c, i) => c === have[i]);

const only = process.argv.slice(2).find((a) => !a.startsWith("--"));
const features = only ? { [only]: FEATURES[only] } : FEATURES;
if (only && !FEATURES[only]) {
  console.error(`unknown feature: ${only}\nknown: ${Object.keys(FEATURES).join(", ")}`);
  process.exit(1);
}

const indexCache = new Map();
const cachedIndexes = async (t) => {
  if (!indexCache.has(t)) indexCache.set(t, await indexesOf(t));
  return indexCache.get(t);
};
const columnCache = new Map();
const cachedColumns = async (t) => {
  if (!columnCache.has(t)) columnCache.set(t, await columnsOf(t));
  return columnCache.get(t);
};

let checked = 0;
let dropped = 0;
let unreadable = 0;
const absent = [];
const accepted = [];
const narrower = [];
const unmappable = [];

for (const [feature, tables] of Object.entries(features)) {
  for (const [source, targets] of Object.entries(tables)) {
    const renames = RENAMES[source] ?? {};
    const sourceIndexes = await cachedIndexes(source);

    for (const idx of sourceIndexes) {
      if (idx.is_primary) continue;

      if (idx.has_expression || !idx.cols) {
        unreadable += 1;
        unmappable.push({ feature, source, index: idx.name, why: "expression index", def: idx.def });
        continue;
      }

      const want = idx.cols.map((c) => renames[c] ?? c);
      if (want.includes("-")) { dropped += 1; continue; }
      checked += 1;

      const candidates = [];
      for (const target of targets) {
        const cols = await cachedColumns(target);
        if (want.every((c) => cols.has(c))) candidates.push(target);
      }

      if (candidates.length === 0) {
        unreadable += 1;
        unmappable.push({
          feature, source, index: idx.name,
          why: `no target holds all of (${want.join(", ")})`,
          def: idx.def,
        });
        continue;
      }

      let exact = false;
      const entered = [];
      for (const target of candidates) {
        for (const t of await cachedIndexes(target)) {
          if (isPrefix(want, t.cols ?? [])) exact = true;
          if (leadsWith(want[0], t)) entered.push(`${target}(${t.cols.join(", ")})`);
        }
      }
      if (exact) continue;

      const row = {
        feature, source, index: idx.name,
        cols: want.join(", "),
        unique: idx.is_unique,
        candidates, entered,
      };
      if (entered.length !== 0) narrower.push(row);
      else if (ACCEPTED[idx.name]) accepted.push(row);
      else absent.push(row);
    }
  }
}

const INDEX_FLOOR = Number(process.env.AUDIT_INDEXES_FLOOR ?? (only ? 1 : 40));
if (checked < INDEX_FLOOR) {
  console.error(
    `audit:indexes compared only ${checked} index(es), expected at least ${INDEX_FLOOR}. ` +
      `Nothing downstream would notice: diff compares output not plans, verify:parity ` +
      `compares rows, validate:wire compares shapes, and all three pass against a table ` +
      `with no indexes whatsoever. The only symptom is latency, in production.`
  );
  process.exit(1);
}

console.log(
  `${checked} index(es) in exchange checked across ${Object.keys(features).length} feature(s)` +
  ` (primary keys excluded; ${dropped} skipped for a column the new schema does not carry)`
);

if (unmappable.length) {
  console.log(`\n${unmappable.length} could not be checked - reported as ?, never as present:`);
  for (const u of unmappable) console.log(`  ?  ${u.feature}: ${u.source}.${u.index} - ${u.why}`);
}

if (narrower.length) {
  console.log(`\n${narrower.length} narrower or reordered in the new schema (the path is still indexed):`);
  for (const m of narrower) {
    console.log(`  ~  ${m.feature}: ${m.source} (${m.cols})`);
    console.log(`         entered instead by: ${m.entered.join(", ")}`);
  }
}

if (accepted.length) {
  console.log(`\n${accepted.length} unindexed in the new schema and accepted - each checked against the queries that run:`);
  for (const m of accepted) {
    console.log(`  ok ${m.feature}: ${m.source} (${m.cols})`);
    console.log(`         ${ACCEPTED[m.index]}`);
  }
}

const seen = new Set(accepted.map((m) => m.index));
const stale = Object.keys(ACCEPTED).filter((k) => !seen.has(k));
if (stale.length) {
  console.log(`\n${stale.length} ACCEPTED entr(ies) no longer report a gap - remove them:`);
  for (const k of stale) console.log(`  STALE  ${k}`);
}

if (absent.length === 0) {
  console.log("\nevery indexed access path in exchange is either still indexed in the schema that replaces it, or accepted by name");
} else {
  console.log(`\n${absent.length} access path(s) with NO index in the new schema:\n`);
  for (const m of absent) {
    console.log(`  ${m.feature}: ${m.source} (${m.cols})${m.unique ? "  [source is UNIQUE]" : ""}`);
    console.log(`      exchange indexes it as ${m.index}`);
    console.log(`      nothing in ${m.candidates.join(" / ")} leads with "${m.cols.split(", ")[0]}"`);
  }
}

await pool.end();
process.exit(absent.length || stale.length ? 1 : 0);
