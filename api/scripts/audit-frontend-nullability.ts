// WHERE THE FRONTEND IS STRICTER THAN THE DATABASE.
//
// The frontend does not import @dorado/contracts (see D33). It keeps its own
// zod schemas instead, and three of them are actually run - checkout payloads
// go through .parse() before being sent. Those payloads are built partly from
// API responses, so a frontend schema can reject the API's own data.
//
// That is not hypothetical. spotPriceSchema requires bid_spot, percent_change
// and dollar_change as z.number() while all three columns permit NULL. Nothing
// fails today only because production happens to hold no nulls in them.
//
// This reports every field a frontend schema REQUIRES whose column PERMITS
// NULL. Each one is a row away from throwing a ZodError in the browser, with
// no server-side fault to find.
//
// Reads information_schema only. It never selects a value, which also keeps it
// clear of exchange.payouts.
//
// --prod reads production (read-only) and is authoritative: migration 033 has
// not been applied there, so dev's column set is not production's.

import fs from "node:fs";
import path from "node:path";
import pg from "pg";
import pool from "#pool";

const ROOT = path.resolve(new URL("..", import.meta.url).pathname, "..");
const FRONTEND = process.env.FE_NULL_FRONTEND_DIR ?? path.join(ROOT, "frontend");
const useProd = process.argv.includes("--prod");

// Only schemas whose table is certain. A guessed mapping would invent findings,
// so anything not here is reported as unmapped rather than assumed clean.
// Keyed by whatever schema name the walk finds in the frontend, so the index
// signature is the honest type: a lookup here is a QUESTION ("is this one of
// the certain ones?"), and its answer being undefined is the `unmapped` branch
// below rather than an error.
const TABLE_OF: Record<string, string | undefined> = {
  addressSchema: "addresses",
  productSchema: "products",
  spotPriceSchema: "metals",
  scrapSchema: "scrap",
  userSchema: "users",
  echeckSchema: "payouts",
  achSchema: "payouts",
  wireSchema: "payouts",
  doradoAccountSchema: "payouts",
};

const walk = (dir: string, match: RegExp, out: string[] = []): string[] => {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (e.name === "node_modules" || e.name === ".next" || e.name.startsWith(".")) continue;
    const full = path.join(dir, e.name);
    if (e.isDirectory()) walk(full, match, out);
    else if (match.test(e.name)) out.push(full);
  }
  return out;
};

// Pull `field: <zod expr>` pairs from the top level of a z.object({...}) only -
// nested objects belong to a different table and must not be attributed here.
function topLevelFields(body: string): [string, string][] {
  const fields: [string, string][] = [];
  let depth = 0, i = 0, keyStart = 0;
  let key: string | null = null;
  while (i < body.length) {
    const c = body[i];
    if (c === "(" || c === "{" || c === "[") depth++;
    else if (c === ")" || c === "}" || c === "]") depth--;
    else if (c === ":" && depth === 0 && key === null) {
      key = body.slice(keyStart, i).trim();
      keyStart = i + 1;
    } else if (c === "," && depth === 0) {
      if (key && /^\w+$/.test(key)) fields.push([key, body.slice(keyStart, i)]);
      key = null; keyStart = i + 1;
    }
    i++;
  }
  if (key && /^\w+$/.test(key)) fields.push([key, body.slice(keyStart)]);
  return fields;
}

function schemasIn(src: string): { name: string; body: string }[] {
  const out: { name: string; body: string }[] = [];
  const re = /export const (\w+) = z\.object\(\{/g;
  let m;
  while ((m = re.exec(src))) {
    let depth = 1, i = re.lastIndex;
    while (i < src.length && depth > 0) {
      if (src[i] === "{") depth++;
      else if (src[i] === "}") depth--;
      i++;
    }
    out.push({ name: m[1], body: src.slice(re.lastIndex, i - 1) });
  }
  return out;
}

const files = walk(FRONTEND, /\.(ts|tsx)$/);
if (files.length < 100) {
  console.error(`only ${files.length} frontend file(s) walked from ${FRONTEND} - not the frontend`);
  process.exit(1);
}

const schemas = [];
for (const f of files) for (const s of schemasIn(fs.readFileSync(f, "utf8"))) {
  schemas.push({ ...s, rel: path.relative(FRONTEND, f) });
}

const prod = useProd
  ? new pg.Pool({
      connectionString: process.env.PROD_READONLY_DATABASE_URL,
      ssl: { rejectUnauthorized: false },
    })
  : null;
if (useProd && !process.env.PROD_READONLY_DATABASE_URL) {
  console.error("PROD_READONLY_DATABASE_URL is not set");
  process.exit(1);
}
const client = prod ?? pool;
const { rows: cols } = await client.query(
  `select table_name, column_name, is_nullable from information_schema.columns where table_schema='exchange'`
);
if (prod) await prod.end();
await pool.end();

const nullableOf = new Map();
for (const r of cols) nullableOf.set(`${r.table_name}.${r.column_name}`, r.is_nullable === "YES");

// A mismatch only THROWS if the schema is actually run. A schema used for
// type inference alone can disagree with the database forever in silence.
// So: find the schemas that reach a .parse()/.safeParse() call, directly or by
// being composed into one.
const parsed = new Set<string>();
for (const f of files) {
  const src = fs.readFileSync(f, "utf8");
  for (const m of src.matchAll(/\b(\w+Schema)\.(safeParse|parse)\(/g)) parsed.add(m[1]);
}
const bodyOf = new Map(schemas.map((s) => [s.name, s.body]));
for (let changed = true; changed; ) {
  changed = false;
  for (const name of [...parsed]) {
    for (const m of (bodyOf.get(name) ?? "").matchAll(/\b(\w+Schema)\b/g)) {
      if (!parsed.has(m[1]) && bodyOf.has(m[1])) { parsed.add(m[1]); changed = true; }
    }
  }
}

console.log(
  `${schemas.length} frontend schema(s) in ${new Set(schemas.map((s) => s.rel)).size} file(s), ` +
    `against ${useProd ? "PRODUCTION" : "dev"}\n`
);

let compared = 0, findings = 0, runFindings = 0;
const unmapped = [];
const suspect = [];
const found = new Map();
for (const s of schemas.sort((a, b) => a.name.localeCompare(b.name))) {
  const table = TABLE_OF[s.name];
  if (!table) { unmapped.push(s.name); continue; }
  const hits = [];
  const all = topLevelFields(s.body);
  let matched = 0;
  for (const [field, expr] of all) {
    const key = `${table}.${field}`;
    if (!nullableOf.has(key)) continue;      // not a column of this table
    matched += 1;
    compared += 1;
    const optional = /\.(optional|nullable|nullish)\(\)/.test(expr);
    if (!optional && nullableOf.get(key)) hits.push(field);
  }
  found.set(s.name, hits);
  findings += hits.length;
  if (parsed.has(s.name)) runFindings += hits.length;
  const run = parsed.has(s.name);
  const verdict = hits.length ? (run ? "RUN" : " - ") : "yes";
  const overlap = all.length ? matched / all.length : 0;
  if (overlap < 0.5) suspect.push(`${s.name} -> ${table} (${matched}/${all.length} fields)`);
  console.log(
    `  ${verdict} ${s.name.padEnd(22)} exchange.${table.padEnd(17)}` +
      `${String(matched).padStart(2)}/${String(all.length).padEnd(2)} fields  ` +
      `${run ? "parsed at runtime" : "type inference only"}`
  );
  for (const h of hits) console.log(`       requires "${h}", but the column permits NULL`);
}

console.log(
  `\n${compared} field(s) compared, ${findings} stricter than the database ` +
    `(${runFindings} in schemas that are parsed at runtime).`
);
console.log(
  "A mismatch is NOT automatically a defect: a form schema SHOULD be stricter " +
    "than\nthe column, because the user must supply what the database allows to be " +
    "absent.\nIt bites only where the value arrives FROM THE API - spotPriceSchema is " +
    "the\nknown case (D33). The RUN marker narrows the list; it does not decide it."
);
if (suspect.length) {
  console.log(
    `\nSUSPECT MAPPING - too few fields are columns of that table, so any finding\n` +
      `is probably a shared word rather than the same thing:\n  ` + suspect.join("\n  ")
  );
}
if (unmapped.length) {
  // WHAT AN UNMAPPED SCHEMA IS COVERED BY, WHICH IS NOT NOTHING.
  //
  // A payload schema - salesOrderCheckoutSchema and friends - has no single
  // table, so it cannot be compared against columns directly. But it EMBEDS
  // schemas that do, and this audit already follows composition when deciding
  // what is parsed at runtime. Printing "unmapped, NOT checked" on its own
  // reads as a coverage hole and hides that its parts were checked - which
  // matters, because those parts are exactly where a checkout payload throws.
  //
  // Written after D49: three checkout schemas parse a payload built from
  // productSchema, spotPriceSchema, userSchema and addressSchema, and two of
  // the three do it AFTER the Stripe charge has succeeded. Knowing which
  // component carries the risk is the whole question there.
  console.log(`unmapped, no table of their own: ${unmapped.join(", ")}`);
  for (const name of unmapped) {
    const parts = [...new Set(
      [...(bodyOf.get(name) ?? "").matchAll(/\b(\w+Schema)\b/g)].map((m) => m[1])
    )].filter((n) => n !== name && TABLE_OF[n]);
    if (!parts.length) continue;
    const withCounts = parts.map(
      (n) => {
        const hits = found.get(n) ?? [];
        return `${n}${hits.length ? ` (${hits.length} finding(s))` : ""}`;
      }
    );
    console.log(
      `  ${name} is covered through: ${withCounts.join(", ")}` +
        (parsed.has(name) ? "  [PARSED AT RUNTIME]" : "")
    );
  }
}
// --self-test: the detector must still report findings known to be true.
//
// IT WAS PINNED TO A SINGLE SCHEMA AND THAT SCHEMA IS GONE. The control was
// `spotPriceSchema` requiring `bid_spot` against a nullable `exchange.metals`
// column (D33) - and the 2026-08-28 conversion deleted it, because the frontend
// now imports its spot shapes from @dorado/contracts rather than declaring its
// own. So this self-test FAILED on a codebase that was working perfectly: the
// finding was not missed, the subject was retired.
//
// That is the right failure - an assertion that cannot see its subject fails
// (D135) - and it is also why a self-test needs MORE THAN ONE control. A single
// control makes the guard exactly as durable as the most deletable thing it
// points at, and this one was pointing at a schema the conversion was always
// going to remove. Two survive today; if one goes, the other still proves the
// parser works while the failure names the one that left.
const CONTROLS = [
  // The address form is the longest-lived hand-written schema in the frontend,
  // and exchange.addresses.line_1 has permitted NULL since the table was made.
  ["addressSchema", "line_1"],
  // A payout schema requiring a bank field the column permits to be absent.
  // These are the plaintext bank details; whatever else changes, they stay.
  ["achSchema", "routing_number"],
];
if (process.argv.includes("--self-test")) {
  const missed = [];
  for (const [schema, field] of CONTROLS) {
    const hits = found.get(schema) ?? [];
    console.log(`\nself-test: ${schema} reports [${hits.join(", ")}]`);
    if (!hits.includes(field)) missed.push(`${schema}.${field}`);
  }
  if (missed.length) {
    console.error(
      `self-test FAILED - ${missed.length} known finding(s) not reported: ${missed.join(", ")}\n` +
        `  Either the parser or the mapping has broken and every other verdict on this\n` +
        `  list is worthless, OR the schema was deliberately deleted (which is what\n` +
        `  happened to spotPriceSchema in the contracts conversion). Check which, then\n` +
        `  repoint CONTROLS - never just remove the entry.`
    );
    process.exit(1);
  }
  console.log("\nself-test: PASS - the detector still fires on every known case");
}

if (compared < 20) {
  console.error(`\nonly ${compared} field(s) compared - the mapping or the parser is broken`);
  process.exit(1);
}
