import pg from 'pg'

const NEVER = 2_000_000_000

export default async function setup(): Promise<void> {
  const url = process.env.DATABASE_URL
  if (!url || process.env.NODE_ENV !== 'test') return
  const client = new pg.Client({ connectionString: url })
  await client.connect()
  try {
    await client.query(
      `UPDATE spots.settings
          SET stale_after_seconds = $1
        WHERE current_database() LIKE 'test%'
          AND stale_after_seconds <> $1`,
      [NEVER]
    )
  } finally {
    await client.end()
  }
}
