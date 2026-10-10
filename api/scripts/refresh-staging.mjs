import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { spawnSync } from 'node:child_process'

const API_DIR = path.join(import.meta.dirname, '..')

const scrub = (s) =>
  String(s).replace(/postgres(?:ql)?:\/\/[^\s'"\\]+/gi, 'postgres://***SCRUBBED***')

const ts = () => new Date().toISOString()
const log = (msg) => console.log(`[${ts()}] ${scrub(String(msg))}`)
const die = (msg) => {
  console.error(`[${ts()}] ${scrub(String(msg))}`)
  process.exit(1)
}

const hostPort = (u) => `${u.hostname.toLowerCase().replace(/^\[|\]$/g, '')}:${u.port || '5432'}`
const dbNameOf = (u) => decodeURIComponent(u.pathname.replace(/^\//, ''))
const withDb = (u, name) => {
  const next = new URL(u.toString())
  next.pathname = `/${name}`
  return next.toString()
}

const SCOPED_NAMES = new Set(['staging', 'staging_next', 'staging_prev', 'test_ci'])
const assertScoped = (name) => {
  if (!SCOPED_NAMES.has(name)) {
    die(
      `internal error: refusing to touch a database named "${name}" - not staging/staging_next/staging_prev/test_ci`
    )
  }
}

if (process.argv.includes('--self-test')) {
  const { selfTest } = await import('./lib/self-test-harness.ts')

  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'refresh-staging-'))
  const REAL = path.join(dir, 'prod.dump')
  const EMPTY = path.join(dir, 'empty.dump')
  fs.writeFileSync(REAL, 'PGDMP pretend')
  fs.writeFileSync(EMPTY, '')
  process.on('exit', () => fs.rmSync(dir, { recursive: true, force: true }))

  const STAGING_URL = 'postgresql://u:p@staging.example.internal:5432/staging'
  const WRONG_DB_URL = 'postgresql://u:p@staging.example.internal:5432/not_staging'
  const PROD_URL = 'postgresql://ro:x@prod.example.internal:5432/prod_readonly'
  const SAME_HOST_AS_PROD_URL = 'postgresql://u:p@prod.example.internal:5432/staging'

  const BLANK = {
    STAGING_DATABASE_URL: '',
    PROD_READONLY_DATABASE_URL: '',
    PAYOUT_ENCRYPTION_KEY: '',
    PAYOUT_ENCRYPTION_KEY_ID: '',
  }

  await selfTest({
    script: new URL(import.meta.url).pathname,
    cases: [
      {
        name: 'dry run with a valid target and an existing dump prints the plan and touches nothing',
        args: ['--url', STAGING_URL, '--dump', REAL],
        env: BLANK,
        expect: 'pass',
        mustPrint: 'dry run',
      },
      {
        name: 'refuses without --url and without STAGING_DATABASE_URL',
        args: ['--dump', REAL],
        env: BLANK,
        expect: 'fail',
        mustPrint: 'STAGING_DATABASE_URL',
      },
      {
        name: 'refuses when the target database name is not exactly "staging"',
        args: ['--url', WRONG_DB_URL, '--dump', REAL],
        env: BLANK,
        expect: 'fail',
        mustPrint: 'not_staging',
      },
      {
        name: "refuses when the target host:port matches PROD_READONLY_DATABASE_URL's",
        args: ['--url', SAME_HOST_AS_PROD_URL, '--dump', REAL],
        env: { ...BLANK, PROD_READONLY_DATABASE_URL: PROD_URL },
        expect: 'fail',
        mustPrint: 'PROD_READONLY_DATABASE_URL',
      },
      {
        name: 'a different host alongside PROD_READONLY_DATABASE_URL is unaffected',
        args: ['--url', STAGING_URL, '--dump', REAL],
        env: { ...BLANK, PROD_READONLY_DATABASE_URL: PROD_URL },
        expect: 'pass',
        mustPrint: 'dry run',
      },
      {
        name: 'refuses without --dump or --from',
        args: ['--url', STAGING_URL],
        env: BLANK,
        expect: 'fail',
        mustPrint: '--dump',
      },
      {
        name: 'refuses when both --dump and --from are given',
        args: ['--url', STAGING_URL, '--dump', REAL, '--from', PROD_URL],
        env: BLANK,
        expect: 'fail',
        mustPrint: 'not both',
      },
      {
        name: 'refuses a --dump file that does not exist',
        args: ['--url', STAGING_URL, '--dump', path.join(dir, 'nope.dump')],
        env: BLANK,
        expect: 'fail',
        mustPrint: 'does not exist',
      },
      {
        name: 'refuses a zero-byte --dump file',
        args: ['--url', STAGING_URL, '--dump', EMPTY],
        env: BLANK,
        expect: 'fail',
        mustPrint: 'zero bytes',
      },
      {
        name: 'refuses --commit without PAYOUT_ENCRYPTION_KEY set',
        args: ['--url', STAGING_URL, '--dump', REAL, '--commit'],
        env: BLANK,
        expect: 'fail',
        mustPrint: 'PAYOUT_ENCRYPTION_KEY',
      },
      {
        name: '--test-db-only dry run rebuilds test_ci and touches nothing else',
        args: ['--url', STAGING_URL, '--test-db-only'],
        env: BLANK,
        expect: 'pass',
        mustPrint: 'test_ci',
      },
      {
        name: 'refuses --test-db-only together with --dump',
        args: ['--url', STAGING_URL, '--test-db-only', '--dump', REAL],
        env: BLANK,
        expect: 'fail',
        mustPrint: '--test-db-only',
      },
      {
        name: 'refuses --test-db-only together with --from',
        args: ['--url', STAGING_URL, '--test-db-only', '--from', PROD_URL],
        env: BLANK,
        expect: 'fail',
        mustPrint: '--test-db-only',
      },
    ],
  })
}

const argv = process.argv.slice(2)
const flag = (name) => {
  const i = argv.indexOf(name)
  return i === -1 ? undefined : argv[i + 1]
}
const has = (name) => argv.includes(name)

const COMMIT = has('--commit')
const DROP_PREVIOUS = has('--drop-previous')
const TEST_DB_ONLY = has('--test-db-only')
const DUMP = flag('--dump')
const FROM = flag('--from')
const DUMP_OUT = flag('--dump-out')
const PG_BIN = process.env.PG_BIN ?? '/usr/lib/postgresql/16/bin'

const targetRaw = flag('--url') ?? process.env.STAGING_DATABASE_URL
if (!targetRaw) {
  die(
    'refusing to run without a target.\n' +
      'Pass --url <connection string>, or set STAGING_DATABASE_URL. This script ' +
      'will not guess which database "staging" is.'
  )
}

let targetUrl
try {
  targetUrl = new URL(targetRaw)
} catch {
  die('the target is not a valid connection string (could not parse as a URL)')
}

const targetDb = dbNameOf(targetUrl)
if (targetDb !== 'staging') {
  die(
    `refusing: the target database is "${targetDb}", not "staging".\n` +
      'This script only ever refreshes a database literally named "staging" - ' +
      'there is no flag to widen that.'
  )
}

const prodRaw = process.env.PROD_READONLY_DATABASE_URL
if (prodRaw) {
  let prodUrl
  try {
    prodUrl = new URL(prodRaw)
  } catch {
    prodUrl = null
  }
  if (prodUrl && hostPort(prodUrl) === hostPort(targetUrl)) {
    die(
      `refusing: the target's host:port (${hostPort(targetUrl)}) matches ` +
        "PROD_READONLY_DATABASE_URL's host:port.\n" +
        'That looks like a production connection string reached this script as ' +
        'the staging target. Refusing rather than restoring, resetting or ' +
        'migrating anything there.'
    )
  }
}

if (TEST_DB_ONLY && (DUMP || FROM)) {
  die(
    '--test-db-only does not take --dump or --from.\n' +
      'It rebuilds test_ci from whatever staging holds right now - nothing is ' +
      'restored, reset or migrated in this mode.'
  )
}

if (!TEST_DB_ONLY) {
  if (DUMP && FROM) {
    die('pass --dump <file> or --from <read-only url>, not both.')
  }
  if (!DUMP && !FROM) {
    die(
      'refusing without a source.\n' +
        'Pass --dump <file> (an existing custom-format dump) or --from <read-only ' +
        'url> to pg_dump one first.'
    )
  }
}

let dumpFile = DUMP
if (DUMP) {
  const stat = fs.existsSync(DUMP) ? fs.statSync(DUMP) : null
  if (!stat || !stat.isFile()) die(`--dump ${DUMP} does not exist as a file.`)
  if (stat.size === 0) die(`--dump ${DUMP} is zero bytes. That is not a dump.`)
}
if (FROM) {
  try {
    new URL(FROM)
  } catch {
    die('--from is not a valid connection string (could not parse as a URL)')
  }
}

if (COMMIT && !TEST_DB_ONLY && !process.env.PAYOUT_ENCRYPTION_KEY) {
  die(
    'refusing --commit without PAYOUT_ENCRYPTION_KEY set.\n' +
      'The chain ends by sealing payout bank numbers in payments.details; a run ' +
      'that cannot do that should not reach the swap at all. Generate or supply ' +
      'the staging key before retrying.'
  )
}

log(`target: staging @ ${hostPort(targetUrl)}`)
if (!TEST_DB_ONLY) {
  log(`source: ${DUMP ? `existing dump ${DUMP}` : `pg_dump from ${hostPort(new URL(FROM))}`}`)
}
log(
  `mode:   ${COMMIT ? 'COMMIT' : 'dry run (pass --commit to act)'}${TEST_DB_ONLY ? ', test-db-only' : ''}`
)

if (!COMMIT) {
  if (TEST_DB_ONLY) {
    log(
      'dry run: would rebuild test_ci from the current staging (terminate backends, ' +
        'drop test_ci if it exists, then CREATE DATABASE test_ci TEMPLATE staging, ' +
        'falling back to a pg_dump | pg_restore clone if the template copy cannot ' +
        'proceed). staging itself is left untouched. Re-run with --commit to act.'
    )
  } else {
    log('dry run: would create staging_next, restore the dump into it, run')
    log('  reset-january + migrate + verify:genesis + verify:backfill +')
    log('  audit:coverage + validate:wire + encrypt:payouts --commit/--verify')
    log('  against staging_next, and only on success rename staging -> staging_prev')
    log(
      `  and staging_next -> staging${DROP_PREVIOUS ? ', then drop staging_prev' : ' (keeping staging_prev for one cycle)'}, ` +
        'then rebuild test_ci from the new staging.'
    )
    log('Nothing was touched. Re-run with --commit to act.')
  }
  process.exit(0)
}

const adminUrl = withDb(targetUrl, 'postgres')
const stagingUrl = withDb(targetUrl, 'staging')
const stagingNextUrl = withDb(targetUrl, 'staging_next')
const testCiUrl = withDb(targetUrl, 'test_ci')

function sh(bin, args, label) {
  const start = Date.now()
  const r = spawnSync(bin, args, { encoding: 'utf8', maxBuffer: 256 * 1024 * 1024 })
  const out = scrub(`${r.stdout ?? ''}${r.stderr ?? ''}`)
  const secs = ((Date.now() - start) / 1000).toFixed(1)
  if (r.status !== 0 || r.error) {
    console.log(out)
    die(`${label} FAILED after ${secs}s (exit ${r.status ?? r.error})`)
  }
  log(`${label} ok (${secs}s)`)
  return out
}

function runNode(scriptRelPath, args, env = {}, label) {
  const start = Date.now()
  const r = spawnSync(process.execPath, [path.join(API_DIR, scriptRelPath), ...args], {
    cwd: API_DIR,
    env: { ...process.env, ...env },
    encoding: 'utf8',
    maxBuffer: 256 * 1024 * 1024,
  })
  const out = scrub(`${r.stdout ?? ''}${r.stderr ?? ''}`)
  const secs = ((Date.now() - start) / 1000).toFixed(1)
  const name = label ?? scriptRelPath
  if (r.status !== 0 || r.error) {
    console.log(out)
    die(`${name} FAILED after ${secs}s (exit ${r.status ?? r.error})`)
  }
  log(`${name} ok (${secs}s)`)
  return out
}

function psqlRun(sql) {
  const bin = path.join(PG_BIN, 'psql')
  const r = spawnSync(bin, ['-v', 'ON_ERROR_STOP=1', '-d', adminUrl, '-c', sql], {
    encoding: 'utf8',
  })
  if (r.status !== 0) die(`psql failed running: ${sql}\n${scrub(r.stderr || r.stdout || '')}`)
  return scrub(r.stdout || '')
}

function psqlTry(sql) {
  const bin = path.join(PG_BIN, 'psql')
  const r = spawnSync(bin, ['-v', 'ON_ERROR_STOP=1', '-d', adminUrl, '-c', sql], {
    encoding: 'utf8',
  })
  return { ok: r.status === 0, output: scrub(r.stderr || r.stdout || '') }
}

function psqlQuery(sql) {
  const bin = path.join(PG_BIN, 'psql')
  const r = spawnSync(bin, ['-t', '-A', '-v', 'ON_ERROR_STOP=1', '-d', adminUrl, '-c', sql], {
    encoding: 'utf8',
  })
  if (r.status !== 0) die(`psql failed running: ${sql}\n${scrub(r.stderr || r.stdout || '')}`)
  return r.stdout.trim()
}

const dbExists = (name) => {
  assertScoped(name)
  return psqlQuery(`SELECT 1 FROM pg_database WHERE datname = '${name}'`) === '1'
}
const terminateBackends = (name) => {
  assertScoped(name)
  psqlRun(
    `SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = '${name}' AND pid <> pg_backend_pid()`
  )
}
const dropDatabase = (name) => {
  assertScoped(name)
  terminateBackends(name)
  psqlRun(`DROP DATABASE "${name}"`)
}
const dropDatabaseIfExists = (name) => {
  assertScoped(name)
  terminateBackends(name)
  psqlRun(`DROP DATABASE IF EXISTS "${name}"`)
}

function rebuildTestCi() {
  assertScoped('test_ci')
  assertScoped('staging')
  log('rebuilding test_ci from staging')
  dropDatabaseIfExists('test_ci')
  terminateBackends('staging')
  const attempt = psqlTry('CREATE DATABASE "test_ci" TEMPLATE "staging"')
  if (attempt.ok) {
    log('test_ci created from staging via CREATE DATABASE ... TEMPLATE')
  } else {
    log(
      'CREATE DATABASE ... TEMPLATE did not succeed; cloning test_ci via pg_dump | pg_restore of staging instead'
    )
    psqlRun('CREATE DATABASE "test_ci"')
    const dump = spawnSync(
      path.join(PG_BIN, 'pg_dump'),
      ['-Fc', '--no-owner', '--no-privileges', '-d', stagingUrl],
      { encoding: 'buffer', maxBuffer: 512 * 1024 * 1024 }
    )
    if (dump.status !== 0) die(`pg_dump of staging failed: ${scrub(dump.stderr?.toString() ?? '')}`)
    const restore = spawnSync(
      path.join(PG_BIN, 'pg_restore'),
      ['--no-owner', '--no-privileges', '-d', testCiUrl],
      { input: dump.stdout, encoding: 'buffer', maxBuffer: 512 * 1024 * 1024 }
    )
    if (restore.status !== 0)
      die(`pg_restore into test_ci failed: ${scrub(restore.stderr?.toString() ?? '')}`)
  }
  log('test_ci rebuilt')
}

log('--- staging refresh starting ---')

if (TEST_DB_ONLY) {
  rebuildTestCi()
  log('--- test_ci rebuild complete ---')
  process.exit(0)
}

if (FROM) {
  dumpFile =
    DUMP_OUT ??
    path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'dorado-staging-refresh-')), 'prod.dump')
  log(`dumping from the read-only source into ${dumpFile}`)
  sh(
    path.join(PG_BIN, 'pg_dump'),
    ['-Fc', '--no-owner', '--no-privileges', '-f', dumpFile, FROM],
    'pg_dump'
  )
  const stat = fs.statSync(dumpFile)
  if (stat.size === 0) die(`pg_dump produced a zero-byte file at ${dumpFile}`)
  log(`DUMP_FILE=${dumpFile} (${(stat.size / 1048576).toFixed(1)} MB)`)
}

if (dbExists('staging_prev')) {
  log('dropping staging_prev left over from the last cycle (kept for one cycle by default)')
  dropDatabase('staging_prev')
}
if (dbExists('staging_next')) {
  log('dropping staging_next left over from a previous incomplete run')
  dropDatabase('staging_next')
}

log('creating staging_next')
assertScoped('staging_next')
psqlRun('CREATE DATABASE "staging_next"')

log('restoring the dump into staging_next')
sh(
  path.join(PG_BIN, 'pg_restore'),
  ['--no-owner', '--no-privileges', '-j', '3', '-d', stagingNextUrl, dumpFile],
  'pg_restore'
)

runNode(
  'scripts/reset-january.ts',
  ['--database', 'staging_next', '--url', stagingNextUrl, '--dump', dumpFile, '--commit'],
  {},
  'reset-january'
)

runNode(
  'scripts/migrate.mjs',
  [],
  { DATABASE_URL: stagingNextUrl, MIGRATE_ALLOW_DB: 'staging_next' },
  'migrate'
)

for (const [script, label] of [
  ['scripts/verify-genesis.mjs', 'verify:genesis'],
  ['scripts/verify-backfill.mjs', 'verify:backfill'],
  ['scripts/audit-coverage.mjs', 'audit:coverage'],
  ['scripts/validate-wire.ts', 'validate:wire'],
]) {
  runNode(script, [], { DATABASE_URL: stagingNextUrl, TZ: 'UTC' }, label)
}

runNode(
  'scripts/encrypt-payout-details.ts',
  ['--commit'],
  {
    DATABASE_URL: stagingNextUrl,
    TZ: 'UTC',
    PAYOUT_ENCRYPTION_KEY: process.env.PAYOUT_ENCRYPTION_KEY,
    PAYOUT_ENCRYPTION_KEY_ID: process.env.PAYOUT_ENCRYPTION_KEY_ID,
  },
  'encrypt:payouts --commit'
)
runNode(
  'scripts/encrypt-payout-details.ts',
  ['--verify'],
  {
    DATABASE_URL: stagingNextUrl,
    TZ: 'UTC',
    PAYOUT_ENCRYPTION_KEY: process.env.PAYOUT_ENCRYPTION_KEY,
    PAYOUT_ENCRYPTION_KEY_ID: process.env.PAYOUT_ENCRYPTION_KEY_ID,
  },
  'encrypt:payouts --verify'
)

log('every step against staging_next succeeded - swapping it into place')
assertScoped('staging')
terminateBackends('staging')
psqlRun('ALTER DATABASE "staging" RENAME TO "staging_prev"')
terminateBackends('staging_next')
psqlRun('ALTER DATABASE "staging_next" RENAME TO "staging"')
log('staging_next is now staging; the previous staging is staging_prev')

rebuildTestCi()

if (DROP_PREVIOUS) {
  log('dropping staging_prev (--drop-previous was passed)')
  dropDatabase('staging_prev')
} else {
  log(
    'keeping staging_prev for one cycle - the next run drops it before building the next staging_next'
  )
}

log('--- staging refresh complete ---')
