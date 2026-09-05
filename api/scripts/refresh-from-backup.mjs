import '#env'
import fs from 'node:fs'
import path from 'node:path'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import pg from 'pg'

const run = promisify(execFile)

const BACKUP_DIR = process.env.BACKUP_DIR ?? '/data/backups'
const REFRESHABLE = new Set(['test', 'dev'])

const arg = (name) => {
  const i = process.argv.indexOf(name)
  return i >= 0 ? process.argv[i + 1] : undefined
}
const has = (name) => process.argv.includes(name)

const target = arg('--target')
const dryRun = has('--dry-run')
const migrate = has('--migrate')

if (!target) {
  console.error(
    `--target is required. Refreshable: ${[...REFRESHABLE].join(', ')}.\n` +
      `Nothing is refreshed by default; naming the database is the point.`
  )
  process.exit(1)
}

if (!REFRESHABLE.has(target)) {
  console.error(
    `refusing to refresh "${target}" - not on the allowlist ` +
      `(${[...REFRESHABLE].join(', ')}).\n` +
      `If that is genuinely a disposable database, add it to REFRESHABLE in ` +
      `this file, deliberately.`
  )
  process.exit(1)
}

const adminUrl = process.env.REFRESH_ADMIN_DATABASE_URL
const sourceUrl = process.env.BACKUP_SOURCE_DATABASE_URL ?? process.env.DUMP_SOURCE_DATABASE_URL

if (!adminUrl) {
  console.error(
    'REFRESH_ADMIN_DATABASE_URL is not set. It needs a superuser connection to ' +
      'a database other than the target - `postgres` is the usual one.'
  )
  process.exit(1)
}

const nameOf = (url) => {
  try {
    return decodeURIComponent(new URL(url).pathname.replace(/^\//, ''))
  } catch {
    return ''
  }
}

if (sourceUrl && nameOf(sourceUrl) === target) {
  console.error(
    `refusing: "${target}" is the database the backups are taken FROM. ` +
      `Restoring a backup over its own source is not a refresh, it is a restore, ` +
      `and it is not this script's job.`
  )
  process.exit(1)
}

function newestBackup() {
  for (const slot of ['hourly', 'daily', 'weekly']) {
    const dir = path.join(BACKUP_DIR, slot)
    if (!fs.existsSync(dir)) continue
    const files = fs
      .readdirSync(dir)
      .filter((f) => f.endsWith('.dump'))
      .map((f) => ({
        name: f,
        full: path.join(dir, f),
        mtime: fs.statSync(path.join(dir, f)).mtimeMs,
      }))
      .sort((a, b) => b.mtime - a.mtime)
    if (files.length) return { ...files[0], slot }
  }
  return null
}

async function pgBinary(name) {
  const explicit = process.env[name.toUpperCase().replace('-', '_')]
  const candidates = explicit
    ? [explicit]
    : [name, `/usr/lib/postgresql/17/bin/${name}`, `/usr/lib/postgresql/16/bin/${name}`]
  for (const bin of candidates) {
    try {
      await run(bin, ['--version'])
      return bin
    } catch {}
  }
  throw new Error(`no usable ${name} found (tried ${candidates.join(', ')})`)
}

const admin = new pg.Pool({ connectionString: adminUrl, connectionTimeoutMillis: 10000 })

try {
  const backup = newestBackup()
  if (!backup) {
    console.error(`no backup found under ${BACKUP_DIR}. Nothing to restore from.`)
    process.exit(1)
  }

  const ageHours = (Date.now() - backup.mtime) / 3600000
  console.log(
    `restoring ${target} from ${backup.slot}/${backup.name} ` +
      `(${(fs.statSync(backup.full).size / 1048576).toFixed(2)} MB, ` +
      `${ageHours.toFixed(1)}h old)`
  )

  const pgRestore = await pgBinary('pg_restore')

  const { stdout: toc } = await run(pgRestore, ['--list', backup.full], {
    maxBuffer: 1024 * 1024 * 64,
  })
  const tableData = (toc.match(/TABLE DATA/g) ?? []).length
  if (tableData < 1) {
    console.error(
      `${backup.name} lists ${tableData} TABLE DATA entries - that is a ` +
        `schema-only or broken archive. Refusing to drop ${target} for it.`
    )
    process.exit(1)
  }
  console.log(`archive lists ${tableData} table-data entries`)

  const { rows: own } = await admin.query(
    `SELECT pg_get_userbyid(datdba) AS owner FROM pg_database WHERE datname = $1`,
    [target]
  )
  const owner = own[0]?.owner
  if (!owner) {
    console.error(
      `${target} does not exist. Create it first; this script refreshes, it does not provision.`
    )
    process.exit(1)
  }
  console.log(`${target} is owned by ${owner}; that ownership will be restored`)

  if (dryRun) {
    console.log('\n--dry-run: stopping here. Nothing was dropped.')
    process.exit(0)
  }

  const { rows: killed } = await admin.query(
    `SELECT count(pg_terminate_backend(pid))::int AS n
       FROM pg_stat_activity WHERE datname = $1 AND pid <> pg_backend_pid()`,
    [target]
  )
  if (killed[0].n) console.log(`terminated ${killed[0].n} connection(s) to ${target}`)

  await admin.query(`DROP DATABASE ${JSON.stringify(target).replace(/"/g, '"')}`)
  await admin.query(`CREATE DATABASE "${target}" OWNER "${owner}"`)
  console.log(`recreated ${target} owned by ${owner}`)

  const targetUrl = (() => {
    const u = new URL(adminUrl)
    u.pathname = `/${target}`
    return u.toString()
  })()

  await run(pgRestore, ['-d', targetUrl, backup.full], { maxBuffer: 1024 * 1024 * 64 })
  console.log('restored')

  if (migrate) {
    console.log('\napplying migrations')
    await run('node', [path.join(import.meta.dirname, 'migrate.mjs')], {
      env: { ...process.env, DATABASE_URL: targetUrl, MIGRATE_ALLOW_DB: target },
      stdio: 'inherit',
    }).catch((e) => {
      console.error(`migrations failed: ${e.message}`)
      process.exitCode = 1
    })
  }

  console.log(`\n${target} refreshed from ${backup.slot}/${backup.name}`)
  console.log(
    `That restore is also the daily proof that the backup is usable - if this ` +
      `step ever fails, the backups are the problem, not this database.`
  )
} catch (err) {
  console.error(`refresh failed: ${err.message}`)
  process.exitCode = 1
} finally {
  await admin.end()
}
