import '#env'
import pg from 'pg'
import { spawnSync } from 'node:child_process'

const REFRESHABLE = new Set(['test'])

const PG_BIN = process.env.PG16_BIN ?? '/usr/lib/postgresql/16/bin'

const COMMIT = process.argv.includes('--commit')

function die(message: string): never {
  console.error(message)
  process.exit(1)
}

const nameOf = (url: string): string => {
  try {
    return decodeURIComponent(new URL(url).pathname.replace(/^\//, ''))
  } catch {
    return ''
  }
}

const sourceUrl = process.env.DATABASE_URL
const targetUrl = process.env.TEST_DATABASE_URL

if (!targetUrl) die('TEST_DATABASE_URL is not set - there is nothing to provision')
if (!sourceUrl) die('DATABASE_URL is not set - there is nothing to copy FROM')

const targetName = nameOf(targetUrl)
const sourceName = nameOf(sourceUrl)

if (!REFRESHABLE.has(targetName)) {
  die(
    `refusing to rebuild "${targetName}" - not on the allowlist ` +
      `(${[...REFRESHABLE].join(', ')}). This script DROPS every schema in the ` +
      `target, so it will only ever point at a database named for disposal.`
  )
}

if (targetName === sourceName) {
  die(`refusing: source and target are both "${targetName}" - the same database`)
}

console.log(`source: ${sourceName} (read only)`)
console.log(`target: ${targetName}`)
console.log(
  `mode:   ${COMMIT ? 'COMMIT - the target will be rebuilt' : 'dry run, nothing is written'}\n`
)

const connect = async (url: string, what: string) => {
  const c = new pg.Client({ connectionString: url, ssl: { rejectUnauthorized: false } })
  try {
    await c.connect()
  } catch (e) {
    die(`could not connect to ${what}: ${(e as Error).message}`)
  }
  return c
}

const src = await connect(sourceUrl, 'the source')
const tgt = await connect(targetUrl, 'the target')

const idOf = async (c: pg.Client) => {
  const { rows } = await c.query<{ db: string; sys: string }>(
    'SELECT current_database() db, system_identifier::text sys FROM pg_control_system()'
  )
  return `${rows[0]!.sys}/${rows[0]!.db}`
}

const srcId = await idOf(src)
const tgtId = await idOf(tgt)
if (srcId === tgtId) {
  await src.end()
  await tgt.end()
  die(`refusing: both URLs resolve to the same database (${srcId})`)
}

const { rows: schemas } = await tgt.query<{ nspname: string }>(`
  SELECT nspname FROM pg_namespace
   WHERE nspname NOT LIKE 'pg_%' AND nspname <> 'information_schema'
   ORDER BY 1`)

const { rows: srcCount } = await src.query<{ n: number }>(`
  SELECT count(*)::int n FROM pg_namespace
   WHERE nspname NOT LIKE 'pg_%' AND nspname <> 'information_schema'`)

console.log(`${srcCount[0]!.n} schema(s) in the source`)
console.log(`${schemas.length} schema(s) in the target, all of which would be dropped:`)
console.log(`  ${schemas.map((s) => s.nspname).join(', ') || '(none)'}\n`)

if (!COMMIT) {
  console.log('dry run - nothing was written. Re-run with --commit.')
  await src.end()
  await tgt.end()
  process.exit(0)
}

for (const { nspname } of schemas) {
  await tgt.query(`DROP SCHEMA IF EXISTS ${JSON.stringify(nspname).replace(/"/g, '"')} CASCADE`)
}
await tgt.query('CREATE SCHEMA IF NOT EXISTS public')
console.log(`dropped ${schemas.length} schema(s) in ${targetName}`)
await src.end()
await tgt.end()

const dump = spawnSync(`${PG_BIN}/pg_dump`, ['--no-owner', '--no-privileges', '-d', sourceUrl], {
  encoding: 'buffer',
  maxBuffer: 1024 * 1024 * 512,
})
if (dump.status !== 0) {
  die(`pg_dump failed: ${dump.stderr?.toString().slice(0, 400)}`)
}
console.log(`dumped ${(dump.stdout.length / 1024 / 1024).toFixed(1)} MB from ${sourceName}`)

const restore = spawnSync(`${PG_BIN}/psql`, ['-q', '-v', 'ON_ERROR_STOP=1', '-d', targetUrl], {
  input: dump.stdout,
  encoding: 'buffer',
  maxBuffer: 1024 * 1024 * 512,
})
const restoreErr = restore.stderr?.toString() ?? ''
if (restore.status !== 0) {
  die(`restore failed: ${restoreErr.slice(0, 800)}`)
}

const check = await connect(targetUrl, 'the target')
const { rows: after } = await check.query<{ n: number }>(`
  SELECT count(*)::int n FROM pg_namespace
   WHERE nspname NOT LIKE 'pg_%' AND nspname <> 'information_schema'`)
await check.end()

console.log(`restored into ${targetName}: ${after[0]!.n} schema(s)`)

if (after[0]!.n < srcCount[0]!.n) {
  die(
    `\nSCHEMA COUNT FELL: ${srcCount[0]!.n} in the source, ${after[0]!.n} here. ` +
      `Something did not restore. Run compare:databases before trusting this.`
  )
}
console.log('\nprovisioned. Run: pnpm --filter @dorado/api test')
