import '#env'
import fs from 'node:fs'
import path from 'node:path'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import pg from 'pg'

const run = promisify(execFile)

const BACKUP_DIR = process.env.BACKUP_DIR ?? '/data/backups'
const SOURCE_VAR = 'BACKUP_SOURCE_DATABASE_URL'
const url = process.env[SOURCE_VAR] ?? process.env.DUMP_SOURCE_DATABASE_URL

const KEEP = { hourly: 24, daily: 7, weekly: 4 }

const MIN_PLAUSIBLE_BYTES = 200 * 1024

if (!url) {
  console.error(
    `Neither ${SOURCE_VAR} nor DUMP_SOURCE_DATABASE_URL is set.\n` +
      `On Railway this should be the PRIVATE endpoint, not the public proxy.`
  )
  process.exit(1)
}

const dbName = (() => {
  try {
    return decodeURIComponent(new URL(url).pathname.replace(/^\//, ''))
  } catch {
    return ''
  }
})()

async function pgDumpBinary() {
  const explicit = process.env.PG_DUMP
  const candidates = explicit
    ? [explicit]
    : ['pg_dump', '/usr/lib/postgresql/17/bin/pg_dump', '/usr/lib/postgresql/16/bin/pg_dump']

  for (const bin of candidates) {
    try {
      const { stdout } = await run(bin, ['--version'])
      const major = Number(/(\d+)/.exec(stdout)?.[1] ?? 0)
      if (major) return { bin, major }
    } catch {}
  }
  throw new Error(
    `no usable pg_dump found (tried ${candidates.join(', ')}). Set PG_DUMP to its path.`
  )
}

async function serverMajor() {
  const pool = new pg.Pool({ connectionString: url, connectionTimeoutMillis: 10000 })
  try {
    const { rows } = await pool.query("SELECT current_setting('server_version_num') AS n")
    return Math.floor(Number(rows[0].n) / 10000)
  } finally {
    await pool.end()
  }
}

const stamp = (d) => d.toISOString().replace(/[-:]/g, '').replace(/\..+$/, '').replace('T', '-')

const isoWeek = (d) => {
  const t = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()))
  t.setUTCDate(t.getUTCDate() + 4 - (t.getUTCDay() || 7))
  const yearStart = new Date(Date.UTC(t.getUTCFullYear(), 0, 1))
  const week = Math.ceil(((t - yearStart) / 86400000 + 1) / 7)
  return `${t.getUTCFullYear()}W${String(week).padStart(2, '0')}`
}

const dirFor = (slot) => path.join(BACKUP_DIR, slot)

function held(slot) {
  const dir = dirFor(slot)
  if (!fs.existsSync(dir)) return []
  return fs
    .readdirSync(dir)
    .filter((f) => f.endsWith('.dump'))
    .sort()
    .map((f) => ({ name: f, full: path.join(dir, f), size: fs.statSync(path.join(dir, f)).size }))
}

function prune() {
  for (const [slot, keep] of Object.entries(KEEP)) {
    const files = held(slot)
    const doomed = files.slice(0, Math.max(0, files.length - keep))
    for (const f of doomed) {
      fs.unlinkSync(f.full)
      console.log(`pruned ${slot}/${f.name}`)
    }
  }
}

function list() {
  for (const slot of Object.keys(KEEP)) {
    const files = held(slot)
    const mb = files.reduce((a, f) => a + f.size, 0) / 1048576
    console.log(
      `${slot.padEnd(7)} ${String(files.length).padStart(3)} file(s)  ${mb.toFixed(1)} MB`
    )
    for (const f of files) console.log(`  ${f.name}  ${(f.size / 1048576).toFixed(2)} MB`)
  }
}

async function backup() {
  const { bin, major } = await pgDumpBinary()
  const server = await serverMajor()
  if (major < server) {
    throw new Error(
      `pg_dump is ${major} and the server is ${server}. pg_dump refuses to dump a ` +
        `newer server; install a client >= ${server} or set PG_DUMP.`
    )
  }

  const now = new Date()
  for (const slot of Object.keys(KEEP)) fs.mkdirSync(dirFor(slot), { recursive: true })

  const name = `${dbName}-${stamp(now)}.dump`
  const target = path.join(dirFor('hourly'), name)

  console.log(`dumping ${dbName} with pg_dump ${major} -> ${target}`)
  await run(bin, ['-Fc', '-f', target, url], { maxBuffer: 1024 * 1024 * 64 })

  const { size } = fs.statSync(target)
  if (size < MIN_PLAUSIBLE_BYTES) {
    fs.unlinkSync(target)
    throw new Error(
      `dump was ${size} bytes, below the ${MIN_PLAUSIBLE_BYTES} floor - that is a ` +
        `schema-only dump or a failure that still exited 0. Removed it rather than ` +
        `keep something that looks like a backup and is not.`
    )
  }
  console.log(`wrote ${(size / 1048576).toFixed(2)} MB`)

  const day = now.toISOString().slice(0, 10)
  const week = isoWeek(now)

  for (const [slot, key] of [
    ['daily', day],
    ['weekly', week],
  ]) {
    const already = held(slot).some((f) => f.name.includes(key))
    if (already) continue
    const link = path.join(dirFor(slot), `${dbName}-${key}.dump`)
    fs.linkSync(target, link)
    console.log(`promoted to ${slot}/${path.basename(link)}`)
  }
}

const argv = process.argv.slice(2)
try {
  if (argv.includes('--list')) {
    list()
  } else if (argv.includes('--prune-only')) {
    prune()
  } else {
    await backup()
    prune()
    console.log('')
    list()
  }
} catch (err) {
  console.error(`backup failed: ${err.message}`)
  process.exitCode = 1
}
