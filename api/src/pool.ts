import '#env'
import pg from 'pg'

const { Pool, types } = pg

export function refusesUnsetDatabaseUrl(env: { DATABASE_URL?: string }): boolean {
  return !env.DATABASE_URL
}

if (refusesUnsetDatabaseUrl(process.env)) {
  throw new Error(
    'DATABASE_URL is not set.\n' +
      'Refusing rather than letting pg fall back to PGHOST/PGUSER/PGDATABASE, ' +
      'which would open a working connection to a different database.\n' +
      'env.ts composes it only when DEV_DATABASE names the database explicitly, ' +
      'so set DATABASE_URL in api/.env - it will not be guessed.'
  )
}

types.setTypeParser(types.builtins.NUMERIC, (value: string) =>
  value === null ? null : parseFloat(value)
)

types.setTypeParser(types.builtins.INT8, (value: string) => (value === null ? null : Number(value)))

const DATABASE_URL = process.env.DATABASE_URL ?? ''
const isLoopback = (() => {
  try {
    const h = new URL(DATABASE_URL).hostname.replace(/^\[|\]$/g, '')
    return h === '127.0.0.1' || h === '::1' || h === 'localhost'
  } catch {
    return false
  }
})()

const pool = new Pool({
  connectionString: DATABASE_URL,
  ...(isLoopback ? {} : { ssl: { rejectUnauthorized: false } }),
})

export default pool
