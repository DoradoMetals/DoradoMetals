// EVERY INDEX IN `exchange` WHOSE COUNTERPART IN THE NEW SCHEMA DOES NOT EXIST.
//
// WHY THIS EXISTS. audit:constraints already compares NOT NULL, CHECK, foreign
// keys and UNIQUE indexes. It reads pg_index deliberately - a bare
// `CREATE UNIQUE INDEX` is not a pg_constraint row - but it filters on
// `i.indisunique`, so the plain ones have never been looked at at all.
//
// A plain index is not a correctness constraint, which is exactly why it is
// dangerous here. Drop a UNIQUE and something eventually raises 23505. Drop a
// plain index and nothing raises anything: the query returns the same rows in
// the same order and takes a sequential scan to do it. The suite stays green.
//
// And it cannot be caught downstream either. `diff` compares the two
// implementations' output, not their plans. verify:parity compares rows.
// validate:wire compares shapes. Every one of them passes on a table with no
// indexes at all. The only signal is latency, and dev holds tens of rows where
// a seq scan is genuinely faster - so dev will never produce the signal. The
// day a *_SOURCE switch moves, production's row counts arrive at a schema
// nobody measured.
//
// Postgres does not index a foreign key automatically, so "the FK is there"
// is not an answer either - audit:constraints passing on FKs says nothing
// about whether the column is indexed.
//
// WHAT COUNTS AS A COUNTERPART. Leading-prefix semantics, not set equality:
// a source index on (a, b) is served by a target index on (a, b, c), because
// btree can use any leading prefix. It is NOT served by one on (b, a). Any
// target index kind satisfies a source index - a UNIQUE or a primary key on
// the same leading columns indexes it just as well as a plain one.
//
// WHAT IT REFUSES TO GUESS. An expression index has no column list to map, and
// a source index whose columns do not all land in one target table cannot be
// checked against that table. Both report `?` and are counted separately.
// Neither is ever reported as present. A scan that cannot see something must
// not call it clean.
//
// Shape comes from dev, where both schemas exist. `--prod` is not offered:
// production has no new schema to compare against.

import "#env";
import pool from "#db";
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

// TWO DIFFERENT QUESTIONS, AND ONLY ONE OF THEM IS THIS AUDIT'S.
//
// Whether uniqueness survives is audit:constraints'. It already reports eight
// source uniques with no exact counterpart and exits 0 while doing it, because
// a source unique on (number) against a target unique on (direction, number) is
// the correct meaning for a table that merged purchase and sales orders. Do not
// re-report those here.
//
// What survives is the ACCESS PATH, which nothing else asks about. btree can
// only be entered on a leading prefix, so the question that separates a
// degradation from a sequential scan is whether ANY target index - unique,
// primary or plain - LEADS with the column the source index leads with. If one
// does, the path is indexed and a narrower target index is at worst a partial
// loss. If none does, the lookup has no index at all.
// Three source indexes have no leading-column counterpart and are deliberately
// not indexed in the new schema. Each was checked against the queries that
// actually run, not waved through: an index nothing reads still costs every
// write, so speculation is the wrong default in both directions.
//
// Pinned from BOTH sides. A gap that is not named here fails the audit; a name
// here that no longer reports a gap fails it too, so the list cannot rot into a
// blanket suppression of something that was since fixed - or of something that
// changed meaning underneath it.
// `unique_payment_intent_id` was here and was WRONG. I declined it because
// provider_ref is always paired with intent_id - but `a.intent_id = i.id` is a
// join condition, not a narrowing filter, so it gives the planner no row to
// seek to. Migration 082 indexes provider_ref and the entry is gone. Reading
// the queries is what makes a shape finding real; reading them CARELESSLY is
// what makes a real one disappear.
const ACCEPTED = {
  idx_products_supplier_id:
    "supplier_id is only ever joined FROM products.bullion TO refiners' primary " +
    "key (repo.next.ts:116), never used to look a bullion row up. The index that " +
    "serves that join is refiners.exchange_compat's PK, which exists.",
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
      // A primary key travels with the row identity, not with a query pattern,
      // and every target defines its own. Not this audit's question.
      if (idx.is_primary) continue;

      if (idx.has_expression || !idx.cols) {
        unreadable += 1;
        unmappable.push({ feature, source, index: idx.name, why: "expression index", def: idx.def });
        continue;
      }

      const want = idx.cols.map((c) => renames[c] ?? c);
      // "-" is the feature map's mark for a column the new schema deliberately
      // does not carry. There is no target column, so there is no index to
      // miss. audit:constraints skips these the same way.
      if (want.includes("-")) { dropped += 1; continue; }
      checked += 1;

      // Which targets could even hold this index? Only one that has every
      // mapped column. A target missing a column is not evidence of a gap -
      // the index simply does not belong to it.
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

// THE FLOOR (D135). This is a REPORT, and a report that cannot see its subject
// prints a smaller number and exits 0 - which for an index audit means "every
// access path survived" when the truth is that none was looked at. 50 indexes
// across 18 features on 2026-08-29, re-measured on the run that added this. It
// only ever grows as the new schema does; a count that falls means the walk or
// the catalogue query broke, not that exchange lost indexes.
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

// The other direction of the pin. An accepted entry that no longer reports a
// gap is stale, and a stale allowlist is how a real finding gets suppressed by
// a name that used to mean something else.
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
