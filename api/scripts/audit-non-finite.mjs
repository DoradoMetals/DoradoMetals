// Does any numeric column hold a value that is not a number?
//
// Postgres NUMERIC accepts 'NaN' as a legitimate value, and node-postgres
// serialises a JavaScript NaN straight into it. So `10 * undefined` in a
// service becomes a stored NaN with no error, no constraint violation and no
// log line. Float columns accept Infinity as well.
//
// THIS EXISTS BECAUSE IT ALREADY HAPPENED. features/scrap/repo.js computes
//
//     convertTroyOz(post_melt_actual ?? pre_melt, unit) * purity_actual
//       ?? item.scrap.content
//
// where the `??` was meant to catch a missing purity and cannot: the product is
// NaN (undefined operand) or 0 (null operand), never null or undefined. Two
// refiners.items rows in dev hold NaN because of it - the recorded weight of
// metal recovered from a customer's parcel. See D47.
//
// A NaN is not merely wrong, it is CONTAGIOUS: every sum, every average and
// every total that touches it becomes NaN, and no comparison against it is ever
// true, so a threshold test silently takes the wrong branch.
//
// Read-only. Checks dev by default, production with --prod (read-only URL).
//
//   pnpm --filter @dorado/api audit:non-finite [--prod] [--strict] [--self-test]
import "#env";
import pg from "pg";

const wantProd = process.argv.includes("--prod");
const url = wantProd ? process.env.PROD_READONLY_DATABASE_URL : process.env.DATABASE_URL;
if (!url) {
  console.error(wantProd ? "PROD_READONLY_DATABASE_URL is not set" : "DATABASE_URL is not set");
  process.exit(1);
}
const pool = new pg.Pool(
  wantProd ? { connectionString: url, ssl: { rejectUnauthorized: false } } : { connectionString: url }
);

// Every schema this project writes, old and new.
const SCHEMAS = [
  "exchange", "orders", "payments", "fulfillments", "shipping", "refiners",
  "tax", "places", "auth", "products", "organizations", "metals", "spots",
  "media", "leads", "rates", "reviews", "checkout", "auctions",
];

const { rows: columns } = await pool.query(
  `SELECT table_schema AS s, table_name AS t, column_name AS c, data_type AS dt
     FROM information_schema.columns
    WHERE table_schema = ANY($1)
      AND data_type IN ('numeric','double precision','real')
      -- Views carry no rows of their own; counting them double-counts a table.
      AND table_name IN (SELECT tablename FROM pg_tables WHERE schemaname = table_schema)
    ORDER BY 1,2,3`,
  [SCHEMAS]
);

if (process.argv.includes("--self-test")) {
  // Prove the detector recognises a NaN, without writing one anywhere: ask
  // Postgres the same question about a literal.
  const { rows } = await pool.query(
    `SELECT count(*) FILTER (WHERE v = 'NaN'::numeric)::int AS found
       FROM (VALUES ('NaN'::numeric), (1::numeric)) AS t(v)`
  );
  console.log(
    rows[0].found === 1
      ? "self-test PASSED: a NaN in a numeric column is detected, a real value is not"
      : `self-test FAILED: expected to find exactly 1 NaN, found ${rows[0].found}`
  );
  await pool.end();
  process.exit(rows[0].found === 1 ? 0 : 1);
}

// THE SCHEMA DENOMINATOR. The list above is hardcoded, and a schema that is not
// in it is not "clean" - it is unlooked at. Production has THIRTEEN schemas and
// this list names ten of them: `core` is the January-refactor ancestor that 013
// splits into the feature schemas, and it is absent here. Worse, the read-only
// audit role has no USAGE on it, so `core` appears in pg_tables and contributes
// ZERO rows to information_schema.columns - a catalogue walk sees it and a
// column walk cannot, and zero columns from a schema is indistinguishable from
// a schema holding no numeric columns.
//
// That is how "PRODUCTION: 151 columns / 38 tables, every value finite" came to
// be reported over ten of production's thirteen schemas. The column floor below
// could not catch it: 151 clears 100 whether or not a schema is missing. D57.
const { rows: present } = await pool.query(
  `SELECT DISTINCT schemaname AS s FROM pg_tables
    WHERE schemaname NOT IN ('pg_catalog', 'information_schema', 'public')`
);
const unlookedAt = present.map((r) => r.s).filter((s) => !SCHEMAS.includes(s)).sort();
// Readability is asked with an UNFILTERED column query. `columns` above is
// already narrowed to numeric types, so a schema legitimately holding none
// contributes zero rows there - which is not the same as being unreadable.
const { rows: readable } = await pool.query(
  `SELECT DISTINCT table_schema AS s FROM information_schema.columns
    WHERE table_schema = ANY($1)`,
  [SCHEMAS]
);
const unreadable = SCHEMAS.filter(
  (s) => present.some((r) => r.s === s) && !readable.some((r) => r.s === s)
).sort();
if (unlookedAt.length || unreadable.length) {
  console.error(
    `this database holds schema(s) this audit did not measure - it is NOT a ` +
      `clean report on the whole database:`
  );
  for (const s of unlookedAt) console.error(`  ${s} - present, not in SCHEMAS`);
  for (const s of unreadable) {
    console.error(`  ${s} - in SCHEMAS and present, but NO readable columns (grant?)`);
  }
  await pool.end();
  process.exit(1);
}

// A floor, so a query that silently stopped returning columns cannot report
// clean - the failure this project keeps hitting from the other direction.
if (columns.length < 100) {
  console.error(
    `only ${columns.length} numeric column(s) found across ${SCHEMAS.length} schemas - ` +
      `the catalogue query is probably wrong`
  );
  await pool.end();
  process.exit(1);
}

const findings = [];
let scanned = 0;

for (const { s, t, c, dt } of columns) {
  // NUMERIC has NaN but no infinities before PG14; float types have both. Ask
  // only what the type can answer, so a cast error never masks a real result.
  const test =
    dt === "numeric"
      ? `"${c}" = 'NaN'::numeric`
      : `("${c}" = 'NaN'::float8 OR "${c}" = 'Infinity'::float8 OR "${c}" = '-Infinity'::float8)`;
  try {
    const { rows } = await pool.query(
      `SELECT count(*) FILTER (WHERE ${test})::int AS bad, count(*)::int AS total
         FROM "${s}"."${t}"`
    );
    scanned++;
    if (rows[0].bad > 0) {
      findings.push(`${s}.${t}.${c} — ${rows[0].bad} of ${rows[0].total} row(s) not finite`);
    }
  } catch (e) {
    findings.push(`${s}.${t}.${c} — could not be checked: ${e.message}`);
  }
}

console.log(
  `${scanned} numeric column(s) checked across ${new Set(columns.map((r) => `${r.s}.${r.t}`)).size} ` +
    `table(s) in ${wantProd ? "PRODUCTION" : "dev"}\n`
);
if (findings.length === 0) {
  console.log("  every numeric column holds finite values only");
} else {
  for (const f of findings) console.log(`  NOT FINITE  ${f}`);
  console.log(
    `\n${findings.length} column(s) hold a value that is not a number. A NaN is contagious:\n` +
      `  every total that touches it becomes NaN, and no comparison against it is ever true.`
  );
}
await pool.end();
process.exitCode = process.argv.includes("--strict") && findings.length ? 1 : 0;
