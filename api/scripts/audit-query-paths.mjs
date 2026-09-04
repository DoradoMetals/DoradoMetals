import "#env";
import fs from "node:fs";
import path from "node:path";
import pool from "#pool";

const ROOT = process.env.AUDIT_QP_ROOT
  ? path.resolve(process.env.AUDIT_QP_ROOT)
  : path.join(import.meta.dirname, "..");
const SCHEMAS = [
  "orders", "payments", "fulfillments", "shipping", "refiners", "tax", "places",
  "auth", "products", "organizations", "metals", "spots", "media", "leads",
  "rates", "reviews", "checkout", "auctions",
];
const S = SCHEMAS.join("|");

if (process.argv.includes("--self-test")) {
  const { selfTest } = await import("./lib/self-test-harness.ts");
  await selfTest({
    script: import.meta.filename,
    cases: [
      {
        name: "the literal floor fires on a tree with no statements in it",
        rootEnv: "AUDIT_QP_ROOT",
        files: { "domain/x/service.ts": "export const noop = () => 1;\n", "shared/keep.ts": "export const k = 1;\n", },
        expect: "fail", mustPrint: "the walk is broken, not the schema",
      },
      {
        name: "the floor is not the only guard: a control it cannot find also fails",
        env: { AUDIT_QP_CONTROL: "media.images|a_column_no_query_filters_on" },
        expect: "fail", mustPrint: "the scan is broken rather than the schema clean",
      },
      {
        name: "the real tree clears both its floor and its control",
        expect: "pass", mustPrint: "distinct query filters checked",
      },
    ],
  });
}

const ACCEPTED = {};

const walk = (d, out = []) => {
  for (const e of fs.readdirSync(d, { withFileTypes: true })) {
    const p = path.join(d, e.name);
    if (e.isDirectory()) {
      if (!/node_modules|\.git|dist|migrations|shared\/testing/.test(p)) walk(p, out);
    }
    else if (/\.(ts|js|sql)$/.test(e.name) && !/\.test\.|\.d\.ts$/.test(e.name)) out.push(p);
  }
  return out;
};

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

for (const f of ["db", "domain", "transport", "shared"]
  .filter((l) => fs.existsSync(path.join(ROOT, l)))
  .flatMap((l) => walk(path.join(ROOT, l)))) {
  const src = fs.readFileSync(f, "utf8");
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

const LITERAL_FLOOR = Number(process.env.AUDIT_QP_LITERAL_FLOOR ?? 100);
if (literals < LITERAL_FLOOR) {
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

const CONTROL = process.env.AUDIT_QP_CONTROL ?? "media.images|user_id";
if (![...seen.keys()].includes(CONTROL)) {
  console.error(
    `the known-present control ${CONTROL} was not found - db/media/images/sql/by_user.sql ` +
    `filters on it, so the scan is broken rather than the schema clean`
  );
  process.exit(1);
}

const unindexed = [], accepted = [], unresolved = [];
let checked = 0, views = 0;
for (const v of seen.values()) {
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
