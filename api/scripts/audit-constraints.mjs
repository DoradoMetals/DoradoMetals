// EVERY NOT NULL IN `exchange` WHOSE COUNTERPART IN THE NEW SCHEMA IS NULLABLE.
//
// WHY THIS EXISTS. A database constraint is sometimes the only thing standing
// between working code and a data-loss bug, and when it is, nobody knows -
// because nothing ever fails.
//
// The one that prompted this: features/users/repo.js updates dorado_funds with
// a CASE that has no ELSE, so an unrecognised mode evaluates to NULL. On a
// customer credit ledger - $66,999.32 across eight customers - that is a wiped
// balance. It has never happened, and the reason is not the code. It is that
// exchange.users.dorado_funds is NOT NULL, so Postgres raises 23502 and writes
// nothing. The service also refuses an unknown mode, but the constraint is the
// backstop underneath it.
//
// Now consider promotion. If the column that replaces it is nullable, that
// backstop is gone the day a *_SOURCE switch moves - and the failure mode is
// not an error, it is a NULL where a balance used to be. Nothing in the suite
// would notice, because the suite runs against a schema that still has the
// constraint.
//
// So this asks one question of every mapped column pair: is the source NOT NULL
// while the target is not? It reads the same FEATURES/RENAMES map audit:precision
// uses, so a rename is followed rather than reported as a loss.
//
// The other direction - target NOT NULL where the source is nullable and holds
// NULLs - is verify:backfill's, and it fails loudly there because the insert
// cannot complete. This one is the silent direction.
//
// Shape comes from dev, where both schemas exist. `--prod` is not offered:
// production has no new schema to compare against.

import "#env";
import pool from "#db";
import { FEATURES, RENAMES } from "./lib/feature-map.mjs";

const describe = async (table) => {
  const [schema, name] = table.split(".");
  const { rows } = await pool.query(
    `SELECT a.attname AS column, a.attnotnull AS not_null,
            format_type(a.atttypid, a.atttypmod) AS type,
            pg_get_expr(d.adbin, d.adrelid) AS default_expr
       FROM pg_attribute a
       JOIN pg_class c ON c.oid = a.attrelid
       JOIN pg_namespace n ON n.oid = c.relnamespace
       LEFT JOIN pg_attrdef d ON d.adrelid = a.attrelid AND d.adnum = a.attnum
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

const shapes = new Map();
const shapeOf = async (table) => {
  if (!shapes.has(table)) shapes.set(table, await describe(table));
  return shapes.get(table);
};

let checked = 0;
let sourceNotNull = 0;
const lost = [];

for (const [feature, sources] of Object.entries(features)) {
  for (const [source, targets] of Object.entries(sources)) {
    const src = await shapeOf(source);
    if (!src.size) continue;
    const renames = RENAMES[source] ?? {};

    for (const [column, s] of src) {
      const targetName = renames[column] ?? column;
      if (targetName === "-") continue;
      if (!s.not_null) continue;
      sourceNotNull += 1;

      for (const target of targets) {
        const dst = await shapeOf(target);
        const t = dst.get(targetName);
        if (!t) continue; // absent is audit:coverage's business, not this one's
        checked += 1;
        if (t.not_null) continue;
        lost.push({
          feature,
          from: `${source}.${column}`,
          to: `${target}.${targetName}`,
          type: s.type,
          // A default does not restore the guard - it only fills an INSERT that
          // omits the column. An explicit NULL still lands.
          target_default: t.default_expr ?? null,
        });
      }
    }
  }
}


console.log(
  `${sourceNotNull} NOT NULL column(s) in the source schema, ` +
    `${checked} with a counterpart in the new schema`
);

// A check that finds nothing accepts everything - but ONLY on a full run. The
// first version applied this floor unconditionally, so `audit:constraints leads`
// compared its 8 pairs correctly and then exited 1 for having found only 8.
// That run is also what proved the floor fires.
if (!only && checked < 50) {
  console.error(
    `only ${checked} pair(s) compared - the feature map or the schema has moved ` +
      `and this is no longer looking at anything`
  );
  process.exit(1);
}


if (!lost.length) {
  console.log("every one of them is NOT NULL on the other side too");
} else {
  console.log(`\n${lost.length} constraint(s) that promotion would drop:\n`);
  const byFeature = {};
  for (const l of lost) (byFeature[l.feature] ??= []).push(l);
  for (const [feature, items] of Object.entries(byFeature)) {
    console.log(`  ${feature}`);
    for (const i of items) {
      console.log(`    ${i.from}  (${i.type}, NOT NULL)`);
      console.log(`      -> ${i.to} is NULLABLE${i.target_default ? ` default ${i.target_default}` : ""}`);
    }
    console.log("");
  }
  console.log(
    "Each is a guard that exists today and would not after the switch moves.\n" +
      "That is not automatically wrong - some columns are deliberately optional in\n" +
      "the new model - but each one should be a decision rather than an accident."
  );
}

// ---------------------------------------------------------------------------
// UNIQUENESS, which is the other kind of guard a promotion can drop.
//
// READ FROM pg_index, NOT pg_constraint. A bare `CREATE UNIQUE INDEX` is not a
// constraint row, and exchange has plenty. My first two attempts at this
// queried pg_constraint and both reported ZERO single-column uniques outside
// primary keys - which is absurd for a schema with a users table, and it took
// counting the indexes directly to notice. Two wrong answers that agreed with
// each other.
//
// Reported rather than judged. A source unique on (number) whose target is
// unique on (direction, number) is WEAKER in the strict sense - the composite
// does not enforce uniqueness of number alone - but for a table that merged
// purchase and sales orders it is the correct meaning. So this prints what each
// side has and leaves the reading to whoever is promoting that feature.
// The ::text[] cast below matters. array_agg of a `name` column yields a
// name[], for which node-postgres has no array parser - it arrives as the raw
// string "{a,b}" and every array method on it throws. (Written here rather
// than in the SQL because a backtick inside a template literal ends it, which
// is how the first attempt at this comment broke the file.)
const uniquesOf = async (table) => {
  const [schema, name] = table.split(".");
  const { rows } = await pool.query(
    `SELECT i.indexrelid,
            bool_or(k.attnum = 0) AS has_expression,
            array_agg(a.attname::text ORDER BY k.ord) AS cols
       FROM pg_index i
       JOIN pg_class c ON c.oid = i.indrelid
       JOIN pg_namespace n ON n.oid = c.relnamespace
       CROSS JOIN LATERAL unnest(i.indkey::int[]) WITH ORDINALITY k(attnum, ord)
       LEFT JOIN pg_attribute a ON a.attrelid = c.oid AND a.attnum = k.attnum
      WHERE n.nspname = $1 AND c.relname = $2 AND i.indisunique
      GROUP BY i.indexrelid`,
    [schema, name]
  );
  return rows.map((r) => ({
    cols: (r.cols ?? []).filter(Boolean),
    expression: r.has_expression,
  }));
};

const sameSet = (a, b) => a.length === b.length && a.every((x) => b.includes(x));

let uniqueChecked = 0;
const uniqueLost = [];

for (const [feature, sources] of Object.entries(features)) {
  for (const [source, targets] of Object.entries(sources)) {
    const renames = RENAMES[source] ?? {};
    for (const u of await uniquesOf(source)) {
      // A surrogate primary key is not the guard anybody relies on.
      if (u.expression || !u.cols.length || (u.cols.length === 1 && u.cols[0] === "id")) continue;
      const mapped = u.cols.map((c) => renames[c] ?? c);
      if (mapped.includes("-")) continue;
      uniqueChecked += 1;

      const alternatives = [];
      let matched = false;
      for (const target of targets) {
        for (const t of await uniquesOf(target)) {
          if (t.expression) { alternatives.push(`${target}(${t.cols.join(", ")} + expression)`); continue; }
          if (sameSet(mapped, t.cols)) { matched = true; break; }
          if (mapped.every((c) => t.cols.includes(c))) alternatives.push(`${target}(${t.cols.join(", ")})`);
        }
        if (matched) break;
      }
      if (!matched) {
        uniqueLost.push({
          feature,
          from: `${source}(${u.cols.join(", ")})`,
          to: mapped.join(", "),
          targets: targets.join(", "),
          alternatives,
        });
      }
    }
  }
}

console.log(`\n${uniqueChecked} unique index(es) in the source schema, excluding primary keys and expressions`);
if (!uniqueLost.length) {
  console.log("every one has an exact counterpart in the new schema");
} else {
  console.log(`${uniqueLost.length} without an exact counterpart:\n`);
  for (const u of uniqueLost) {
    console.log(`  ${u.feature}`);
    console.log(`    ${u.from}`);
    console.log(`      -> nothing in ${u.targets} is unique on (${u.to})`);
    if (u.alternatives.length) {
      console.log(`      the target does have: ${[...new Set(u.alternatives)].join("; ")}`);
      console.log(`      WIDER is not the same as equal - a unique on (a, b) does not make a unique`);
    }
    console.log("");
  }
}

await pool.end();
