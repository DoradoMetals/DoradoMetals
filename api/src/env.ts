import path from 'node:path'
import { execSync } from 'node:child_process'
import dotenv from 'dotenv'

dotenv.config({ path: path.join(import.meta.dirname, '..', '.env'), quiet: true })

const compose = (
  user: string | undefined,
  password: string | undefined,
  database: string
): string | undefined => {
  if (!user || !password || !process.env.PGHOST) return undefined
  const url = new URL(`postgresql://${process.env.PGHOST}`)
  if (process.env.PGPORT) url.port = process.env.PGPORT
  url.username = encodeURIComponent(user)
  url.password = encodeURIComponent(password)
  url.pathname = `/${database}`
  return url.toString()
}

const dorado = (database: string) =>
  compose(process.env.DORADO_USER, process.env.DORADO_PASSWORD, database)
const readonly = (database: string) =>
  compose(process.env.READONLY_USER, process.env.READONLY_PASSWORD, database)

const isLoopbackHost = (url: string): boolean => {
  try {
    const h = new URL(url).hostname.replace(/^\[|\]$/g, '')
    return h === '127.0.0.1' || h === '::1' || h === 'localhost'
  } catch {
    return false
  }
}

const deriveTestDatabaseName = (testUrl: string): string | null => {
  if (!isLoopbackHost(testUrl)) return null
  try {
    const run = (cmd: string) =>
      execSync(cmd, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim()
    const branch = run('git branch --show-current')
    if (!branch || branch === 'api-hardening') return 'test'
    const gitDir = path.resolve(run('git rev-parse --git-dir'))
    const commonDir = path.resolve(run('git rev-parse --git-common-dir'))
    if (gitDir === commonDir) return 'test'
    const sanitised = branch
      .toLowerCase()
      .replace(/[^a-z0-9_]+/g, '_')
      .replace(/^_+|_+$/g, '')
    return `test_${sanitised}`
  } catch {
    return null
  }
}

const COMPOSED: Record<string, () => string | undefined> = {
  DATABASE_URL: () => (process.env.DEV_DATABASE ? dorado(process.env.DEV_DATABASE) : undefined),
  TEST_DATABASE_URL: () => dorado(process.env.TEST_DATABASE ?? 'test'),
  DUMP_SOURCE_DATABASE_URL: () => dorado(process.env.PROD_DATABASE ?? 'prod'),
  BACKUP_SOURCE_DATABASE_URL: () => dorado(process.env.PROD_DATABASE ?? 'prod'),
  PROD_READONLY_DATABASE_URL: () => readonly(process.env.PROD_DATABASE ?? 'prod'),
  REFRESH_ADMIN_DATABASE_URL: () => dorado('postgres'),
}

for (const [name, build] of Object.entries(COMPOSED)) {
  if (process.env[name]) continue
  const url = build()
  if (url) process.env[name] = url
}

if (process.env.USE_TEST_DB === '1') {
  let testUrl = process.env.TEST_DATABASE_URL
  if (!testUrl) {
    throw new Error('USE_TEST_DB=1 but TEST_DATABASE_URL is not set')
  }

  if (!process.env.TEST_DATABASE) {
    const derived = deriveTestDatabaseName(testUrl)
    if (derived) {
      const u = new URL(testUrl)
      if (u.pathname !== `/${derived}`) {
        u.pathname = `/${derived}`
        testUrl = u.toString()
        process.env.TEST_DATABASE_URL = testUrl
      }
      process.env.TEST_DATABASE = derived
    }
  }

  const name = (() => {
    try {
      return decodeURIComponent(new URL(testUrl).pathname.replace(/^\//, ''))
    } catch {
      return ''
    }
  })()
  if (name !== (process.env.TEST_DATABASE ?? 'test')) {
    throw new Error(
      `USE_TEST_DB=1 but TEST_DATABASE_URL points at "${name}", not the test ` +
        `database. Refusing rather than running a suite against it.`
    )
  }
  process.env.DATABASE_URL = testUrl
}
