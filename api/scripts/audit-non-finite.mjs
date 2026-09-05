import '#env'
import pg from 'pg'
import { NATIVE_SCHEMAS } from './lib/schemas.ts'

const wantProd = process.argv.includes('--prod')
const url = wantProd ? process.env.PROD_READONLY_DATABASE_URL : process.env.DATABASE_URL
if (!url) {
  console.error(wantProd ? 'PROD_READONLY_DATABASE_URL is not set' : 'DATABASE_URL is not set')
  process.exit(1)
}
const pool = new pg.Pool(
  wantProd
    ? { connectionString: url, ssl: { rejectUnauthorized: false } }
    : { connectionString: url }
)

const SCHEMAS = ['exchange', ...NATIVE_SCHEMAS]

const { rows: columns } = await pool.query(
  `SELECT table_schema AS s, table_name AS t, column_name AS c, data_type AS dt
     FROM information_schema.columns
    WHERE table_schema = ANY($1)
      AND data_type IN ('numeric','double precision','real')
      -- Views carry no rows of their own; counting them double-counts a table.
      AND table_name IN (SELECT tablename FROM pg_tables WHERE schemaname = table_schema)
    ORDER BY 1,2,3`,
  [SCHEMAS]
)

if (process.argv.includes('--self-test')) {
  const { rows } = await pool.query(
    `SELECT count(*) FILTER (WHERE v = 'NaN'::numeric)::int AS found
       FROM (VALUES ('NaN'::numeric), (1::numeric)) AS t(v)`
  )
  console.log(
    rows[0].found === 1
      ? 'self-test PASSED: a NaN in a numeric column is detected, a real value is not'
      : `self-test FAILED: expected to find exactly 1 NaN, found ${rows[0].found}`
  )
  await pool.end()
  process.exit(rows[0].found === 1 ? 0 : 1)
}

const { rows: present } = await pool.query(
  `SELECT DISTINCT schemaname AS s FROM pg_tables
    WHERE schemaname NOT IN ('pg_catalog', 'information_schema', 'public')`
)
const unlookedAt = present
  .map((r) => r.s)
  .filter((s) => !SCHEMAS.includes(s))
  .sort()
const { rows: readable } = await pool.query(
  `SELECT DISTINCT table_schema AS s FROM information_schema.columns
    WHERE table_schema = ANY($1)`,
  [SCHEMAS]
)
const unreadable = SCHEMAS.filter(
  (s) => present.some((r) => r.s === s) && !readable.some((r) => r.s === s)
).sort()
if (unlookedAt.length || unreadable.length) {
  console.error(
    `this database holds schema(s) this audit did not measure - it is NOT a ` +
      `clean report on the whole database:`
  )
  for (const s of unlookedAt) console.error(`  ${s} - present, not in SCHEMAS`)
  for (const s of unreadable) {
    console.error(`  ${s} - in SCHEMAS and present, but NO readable columns (grant?)`)
  }
  await pool.end()
  process.exit(1)
}

if (columns.length < 100) {
  console.error(
    `only ${columns.length} numeric column(s) found across ${SCHEMAS.length} schemas - ` +
      `the catalogue query is probably wrong`
  )
  await pool.end()
  process.exit(1)
}

const findings = []
let scanned = 0

for (const { s, t, c, dt } of columns) {
  const test =
    dt === 'numeric'
      ? `"${c}" = 'NaN'::numeric`
      : `("${c}" = 'NaN'::float8 OR "${c}" = 'Infinity'::float8 OR "${c}" = '-Infinity'::float8)`
  try {
    const { rows } = await pool.query(
      `SELECT count(*) FILTER (WHERE ${test})::int AS bad, count(*)::int AS total
         FROM "${s}"."${t}"`
    )
    scanned++
    if (rows[0].bad > 0) {
      findings.push(`${s}.${t}.${c} — ${rows[0].bad} of ${rows[0].total} row(s) not finite`)
    }
  } catch (e) {
    findings.push(`${s}.${t}.${c} — could not be checked: ${e.message}`)
  }
}

console.log(
  `${scanned} numeric column(s) checked across ${new Set(columns.map((r) => `${r.s}.${r.t}`)).size} ` +
    `table(s) in ${wantProd ? 'PRODUCTION' : 'dev'}\n`
)
if (findings.length === 0) {
  console.log('  every numeric column holds finite values only')
} else {
  for (const f of findings) console.log(`  NOT FINITE  ${f}`)
  console.log(
    `\n${findings.length} column(s) hold a value that is not a number. A NaN is contagious:\n` +
      `  every total that touches it becomes NaN, and no comparison against it is ever true.`
  )
}
await pool.end()
process.exitCode = process.argv.includes('--strict') && findings.length ? 1 : 0
