// EVERY QUERY AGAINST THE NEW SCHEMAS THAT HAS NO INDEX TO ENTER BY.
//
// WHY THIS EXISTS, GIVEN audit:indexes ALREADY RUNS. That one is SOURCE-driven:
// it walks exchange's indexes and asks whether each survived into the schema
// replacing it. It is blind by construction to a lookup that exchange never
// had - a WHERE clause written fresh in a repo.next.ts has no exchange index to
// be compared against, so no comparison happens and nothing is reported.
//
// This is the other direction: start from the queries. For every parameterised
// equality filter in code that touches the eighteen new schemas, ask whether
// any index on that table LEADS with one of the columns the query filters on.
// If none does, Postgres has nothing to seek to and must scan.
//
// It earned its keep immediately, and against audit:indexes' own conclusion.
// The pair (exchange.payment_intents.provider_ref -> payments.attempts) was
// reported by audit:indexes and I declined it, because provider_ref is always
// written next to intent_id and intent_id is indexed. But the live query is
//
//     UPDATE payments.intents i SET ... FROM payments.attempts a
//      WHERE a.intent_id = i.id AND a.provider_ref = $3
//
// and `a.intent_id = i.id` is a JOIN CONDITION, not a narrowing filter. It says
// how two tables line up; it does not say which row to find. Nothing else
// constrains either side, so there was no seek at all - exchange sought in
// O(log n) through UNIQUE(provider_ref) and the new schema scanned every attempt
// ever made, on the Stripe webhook path. Migration 082 fixed it.
//
// THE UNIT IS THE QUERY, NOT THE COLUMN. A WHERE that filters
// `user_id = $1 AND direction = $2` is fully served by an index leading with
// user_id: btree is entered once and the remaining predicate applies to very
// few rows. Asking per column calls that query unindexed twice over. Getting
// this wrong turned 4 findings into 8 and buried the real one.
//
// WHAT IT REFUSES TO GUESS. A filter whose column does not exist on the table
// it was attributed to means the alias resolution was wrong, not that the schema
// is missing something - it reports `?`. Views are excluded: they cannot carry
// an index and what matters is the indexes on the tables underneath.

import "#env";
import fs from "node:fs";
import path from "node:path";
import pool from "#db";

const ROOT = path.join(import.meta.dirname, "..");
const SCHEMAS = [
  "orders", "payments", "fulfillments", "shipping", "refiners", "tax", "places",
  "auth", "products", "organizations", "metals", "spots", "media", "leads",
  "rates", "reviews", "checkout", "auctions",
];
const S = SCHEMAS.join("|");

// Queries that legitimately have no index to enter by. Pinned from both sides:
// an unnamed one fails, and a name that no longer reports fails too.
const ACCEPTED = {
  "metals.metals|name":
    "four rows. The product save resolves a metal by name inside the statement " +
    "that writes everything else; on a table this size a sequential scan is the " +
    "faster plan and an index would only cost writes.",
  "places.locations|type":
    "three rows - the business's own locations, seeded reference data.",
};

const walk = (d, out = []) => {
  for (const e of fs.readdirSync(d, { withFileTypes: true })) {
    const p = path.join(d, e.name);
    if (e.isDirectory()) { if (!/node_modules|\.git|dist|migrations/.test(p)) walk(p, out); }
    // .sql TOO. Statements moved out of template literals and into .sql files
    // with the per-table feature restructure, and this scan could no longer see
    // them - which the known-present control below caught immediately rather
    // than reporting a blind run as clean.
    else if (/\.(ts|js|sql)$/.test(e.name) && !/\.test\.|\.d\.ts$/.test(e.name)) out.push(p);
  }
  return out;
};

// A subquery is its own scope: its WHERE belongs to ITS FROM, and its closing
// paren ends the enclosing statement's SET list. Without this, a
// `SET col = (SELECT id FROM x WHERE name = $2), other = $3, ...` leaks the
// whole remaining SET list into the WHERE region and attributes `name` to the
// outer table. That produced 40-odd findings that were all assignments.
const scopes = (sql) => {
  let depth = 0, own = "", start = 0;
  const groups = [];
  for (let i = 0; i < sql.length; i++) {
    const ch = sql[i];
    if (ch === "(") { if (depth === 0) { own += " "; start = i + 1; } depth++; }
    else if (ch === ")") { depth--; if (depth === 0) groups.push(sql.slice(start, i)); if (depth < 0) depth = 0; }
    else if (depth === 0) own += ch;
  }
  return { own, groups };
};

const NOT_AN_ALIAS = /^(WHERE|SET|ON|VALUES|AS|USING|LEFT|RIGHT|INNER|OUTER|CROSS|JOIN|SELECT|GROUP|ORDER|LIMIT|RETURNING|WITH)$/i;

const found = [];
let literals = 0;

const scan = (sql, file, line) => {
  const { own, groups } = scopes(sql);
  const alias = new Map();
  let defaultTable = null;
  for (const t of own.matchAll(new RegExp(`\\b(?:FROM|JOIN|UPDATE|INTO)\\s+((?:${S})\\.\\w+)(?:\\s+(?:AS\\s+)?(\\w+))?`, "gi"))) {
    const table = t[1].toLowerCase();
    if (t[2] && !NOT_AN_ALIAS.test(t[2])) alias.set(t[2].toLowerCase(), table);
    alias.set(table.split(".")[1], table);
    if (!defaultTable) defaultTable = table;
  }

  const regions = [];
  for (const w of own.matchAll(/\bWHERE\b/gi)) {
    const rest = own.slice(w.index + 5);
    const end = rest.search(/\b(GROUP\s+BY|ORDER\s+BY|LIMIT|RETURNING|ON\s+CONFLICT)\b/i);
    regions.push(end === -1 ? rest : rest.slice(0, end));
  }
  for (const j of own.matchAll(/\bJOIN\s+[\w.]+(?:\s+(?:AS\s+)?\w+)?\s+ON\b/gi)) {
    const rest = own.slice(j.index + j[0].length);
    const end = rest.search(/\b(WHERE|JOIN|GROUP\s+BY|ORDER\s+BY|LIMIT|RETURNING)\b/i);
    regions.push(end === -1 ? rest : rest.slice(0, end));
  }

  for (const region of regions) {
    const byTable = new Map();
    for (const c of region.matchAll(/(?:(\w+)\.)?(\w+)\s*=\s*\$(\d+)/g)) {
      const [, a, col] = c;
      const table = a ? alias.get(a.toLowerCase()) : defaultTable;
      if (!table) continue;
      if (!byTable.has(table)) byTable.set(table, new Set());
      byTable.get(table).add(col.toLowerCase());
    }
    for (const [table, cols] of byTable) found.push({ file, line, table, cols: [...cols] });
  }
  for (const g of groups) if (/\b(FROM|UPDATE|JOIN|WHERE)\b/i.test(g)) scan(g, file, line);
};

for (const f of walk(path.join(ROOT, "features"))
  .concat(walk(path.join(ROOT, "shared")))
  // legacy/ holds the dual-write mirrors since the 26c factoring; their
  // statements are as live as any other until promotion.
  .concat(walk(path.join(ROOT, "legacy")))) {
  const src = fs.readFileSync(f, "utf8");
  // A .sql file IS the statement; a .ts file carries them in backticks.
  const blobs = f.endsWith(".sql")
    ? [{ 1: src, index: 0 }]
    : [...src.matchAll(/`([^`]*)`/gs)];
  for (const m of blobs) {
    const sql = m[1];
    if (!new RegExp(`\\b(?:FROM|JOIN|UPDATE|INTO)\\s+(?:${S})\\.`, "i").test(sql)) continue;
    literals += 1;
    scan(sql, path.relative(ROOT, f), src.slice(0, m.index).split("\n").length);
  }
}

// A scan that walked nothing must not report clean. The floor alone is too weak
// to notice PARTIAL breakage - dropping three of the eighteen schemas still left
// 113 literals and the run reported clean - so a known-present control has to be
// found as well. getUserImages is the query migration 081 was written for; if
// this scan cannot see it, it cannot see anything and must say so.
if (literals < 100) {
  console.error(`only ${literals} SQL literals found against the new schemas - the walk is broken, not the schema`);
  process.exit(1);
}

const { rows: idx } = await pool.query(
  `SELECT n.nspname || '.' || c.relname AS tbl,
          (SELECT a.attname::text
             FROM unnest(i.indkey::int[]) WITH ORDINALITY AS k(attnum, ord)
             JOIN pg_attribute a ON a.attrelid = i.indrelid AND a.attnum = k.attnum
            WHERE k.ord = 1) AS lead
     FROM pg_index i
     JOIN pg_class c ON c.oid = i.indrelid
     JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = ANY($1)`,
  [SCHEMAS]
);
const leads = new Map();
for (const r of idx) {
  if (!leads.has(r.tbl)) leads.set(r.tbl, new Set());
  if (r.lead) leads.get(r.tbl).add(r.lead);
}

const { rows: cols } = await pool.query(
  `SELECT table_schema || '.' || table_name AS tbl, column_name, table_type
     FROM information_schema.columns
     JOIN information_schema.tables USING (table_schema, table_name)
    WHERE table_schema = ANY($1)`,
  [SCHEMAS]
);
const columnsOf = new Map();
const kindOf = new Map();
for (const r of cols) {
  if (!columnsOf.has(r.tbl)) columnsOf.set(r.tbl, new Set());
  columnsOf.get(r.tbl).add(r.column_name);
  kindOf.set(r.tbl, r.table_type);
}

const seen = new Map();
for (const f of found) {
  const key = `${f.table}|${[...f.cols].sort().join(",")}`;
  if (!seen.has(key)) seen.set(key, { table: f.table, cols: f.cols, sites: new Set() });
  seen.get(key).sites.add(`${f.file}:${f.line}`);
}

const CONTROL = "media.images|user_id";
if (![...seen.keys()].includes(CONTROL)) {
  console.error(
    `the known-present control ${CONTROL} was not found - features/media/sql/by_user.sql ` +
    `filters on it, so the scan is broken rather than the schema clean`
  );
  process.exit(1);
}

const unindexed = [], accepted = [], unresolved = [];
let checked = 0, views = 0;
for (const v of seen.values()) {
  // A view carries no index of its own; what matters is the tables underneath.
  if (kindOf.get(v.table) === "VIEW") { views += 1; continue; }
  if (!columnsOf.has(v.table)) { unresolved.push({ ...v, why: "table not found" }); continue; }
  const unknown = v.cols.filter((c) => !columnsOf.get(v.table).has(c));
  if (unknown.length) { unresolved.push({ ...v, why: `not columns of it: ${unknown.join(", ")}` }); continue; }
  checked += 1;
  if (v.cols.some((c) => leads.get(v.table)?.has(c))) continue;
  const key = `${v.table}|${v.cols.sort().join(",")}`;
  (ACCEPTED[key] ? accepted : unindexed).push({ ...v, key });
}

console.log(`${literals} SQL literals against the new schemas; ${checked} distinct query filters checked (${views} on views, which carry no index)`);

if (unresolved.length) {
  console.log(`\n${unresolved.length} could not be checked - reported as ?, never as clean:`);
  for (const u of unresolved) console.log(`  ?  ${u.table} (${u.cols.join(", ")}) - ${u.why}`);
}

if (accepted.length) {
  console.log(`\n${accepted.length} with no index to enter by, and accepted:`);
  for (const a of accepted) console.log(`  ok ${a.table} ON (${a.cols.join(" AND ")})\n         ${ACCEPTED[a.key]}`);
}

const seenKeys = new Set(accepted.map((a) => a.key));
const stale = Object.keys(ACCEPTED).filter((k) => !seenKeys.has(k));
if (stale.length) {
  console.log(`\n${stale.length} ACCEPTED entr(ies) no longer report - remove them:`);
  for (const k of stale) console.log(`  STALE  ${k}`);
}

if (unindexed.length === 0) {
  console.log("\nevery query against the new schemas has an index to enter by, or is accepted by name");
} else {
  console.log(`\n${unindexed.length} quer(ies) with NO index to enter by:\n`);
  for (const u of unindexed) {
    console.log(`  ${u.table} ON (${u.cols.join(" AND ")})`);
    for (const s of u.sites) console.log(`      ${s}`);
  }
}

await pool.end();
process.exit(unindexed.length || stale.length ? 1 : 0);
