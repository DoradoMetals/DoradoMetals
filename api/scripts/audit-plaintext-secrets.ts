import '#env'
import pg from 'pg'

const quote = (ident: string) => `"${ident.replace(/"/g, '""')}"`

if (process.argv.includes('--self-test')) {
  const { selfTest } = await import('./lib/self-test-harness.ts')
  await selfTest({
    script: new URL(import.meta.url).pathname,
    cases: [
      {
        name: 'refuses --prod with no PROD_READONLY_DATABASE_URL',
        expect: 'fail',
        args: ['--prod'],
        env: { PROD_READONLY_DATABASE_URL: '' },
        mustPrint: 'PROD_READONLY_DATABASE_URL',
      },
      {
        name: 'refuses a database it cannot reach',
        expect: 'fail',
        env: { DATABASE_URL: 'postgresql://nobody@127.0.0.1:1/nope' },
        mustPrint: 'could not connect',
      },
      {
        name: 'scans dev and reports',
        expect: 'pass',
        env: { AUDIT_PLAINTEXT_TOLERATE_FINDINGS: '1' },
        mustPrint: 'candidate column(s)',
      },
    ],
  })
}

const PROD = process.argv.includes('--prod')
const TOLERATE = process.env.AUDIT_PLAINTEXT_TOLERATE_FINDINGS === '1'

const url = PROD ? process.env.PROD_READONLY_DATABASE_URL : process.env.DATABASE_URL
if (!url) {
  console.error(PROD ? 'PROD_READONLY_DATABASE_URL is not set' : 'DATABASE_URL is not set')
  process.exit(1)
}

const SECRET_NAME = `(
     c.column_name ~ '(^|_)(routing|account)_number$'
  OR c.column_name ~ '(^|_)(ssn|tax_id|iban|swift)$'
)`

const IS_SEALED = `c.column_name LIKE '%_encrypted'`

const client = new pg.Client({
  connectionString: url,
  ssl: PROD ? { rejectUnauthorized: false } : undefined,
})

try {
  await client.connect()
} catch (e) {
  console.error(`could not connect: ${(e as Error).message}`)
  process.exit(1)
}

let findings = 0

try {
  const { rows: dbname } = await client.query<{ d: string }>('SELECT current_database() d')
  console.log(`database: ${dbname[0]!.d}${PROD ? '  (production, read-only)' : ''}\n`)

  const { rows: columns } = await client.query<{
    table_schema: string
    table_name: string
    column_name: string
  }>(`
    SELECT c.table_schema, c.table_name, c.column_name
      FROM information_schema.columns c
      JOIN information_schema.tables t
        ON t.table_schema = c.table_schema
       AND t.table_name = c.table_name
       AND t.table_type = 'BASE TABLE'
     WHERE c.table_schema NOT IN ('pg_catalog', 'information_schema')
       AND ${SECRET_NAME}
       AND NOT ${IS_SEALED}
     ORDER BY 1, 2, 3
  `)

  console.log(`${columns.length} candidate column(s) found by name`)

  const KNOWN = ['exchange.payouts.routing_number', 'exchange.payouts.account_number']
  const seen = new Set(columns.map((c) => `${c.table_schema}.${c.table_name}.${c.column_name}`))
  const missing = KNOWN.filter((k) => !seen.has(k))
  if (missing.length) {
    console.error(
      `\nSCAN IS BROKEN: it did not find ${missing.join(', ')}, which this ` +
        `database is known to have. A zero result here would be a false all-clear.`
    )
    process.exit(1)
  }

  const { rows: withUser } = await client.query<{ k: string }>(`
    SELECT table_schema || '.' || table_name AS k
      FROM information_schema.columns
     WHERE column_name = 'user_id'
       AND table_schema NOT IN ('pg_catalog', 'information_schema')
  `)
  const hasUserId = new Set(withUser.map((r) => r.k))

  for (const c of columns) {
    const qualified = `${c.table_schema}.${c.table_name}.${c.column_name}`
    const table = `${quote(c.table_schema)}.${quote(c.table_name)}`
    const col = quote(c.column_name)
    const users = hasUserId.has(`${c.table_schema}.${c.table_name}`)
      ? 'count(DISTINCT user_id)::int'
      : '0'

    const { rows } = await client.query<{ n: number; users: number }>(
      `SELECT count(${col})::int AS n, ${users} AS users
         FROM ${table} WHERE ${col} IS NOT NULL`
    )
    const n = rows[0]!.n
    if (n === 0) {
      console.log(`  ok    ${qualified}  (empty)`)
    } else {
      findings += 1
      const who = rows[0]!.users ? `, ${rows[0]!.users} customer(s)` : ''
      console.log(`  PLAIN ${qualified}  ${n} value(s)${who}`)
    }
  }

  console.log(
    findings === 0
      ? '\nno plaintext bank details at rest'
      : `\n${findings} column(s) hold plaintext bank details at rest`
  )
} finally {
  await client.end()
}

if (findings && !TOLERATE) process.exit(1)
