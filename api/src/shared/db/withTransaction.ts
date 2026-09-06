import pool from '#pool'
import type { PoolClient } from 'pg'
import { currentActor } from '#shared/http/actor.ts'
import { asDomainError } from '#shared/db/pg-error.ts'
import { reportError } from '#shared/observability/report.ts'

export default async function withTransaction<T>(
  fn: (client: PoolClient) => Promise<T>,
  { actor }: { actor?: string | null } = {}
): Promise<T> {
  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    await client.query("SELECT set_config('app.actor_id', $1, true)", [
      actor ?? currentActor() ?? '',
    ])
    const result = await fn(client)
    await client.query('COMMIT')
    return result
  } catch (err) {
    try {
      await client.query('ROLLBACK')
    } catch (rollbackErr) {
      reportError({
        at: 'withTransaction.rollback',
        message: 'the ROLLBACK itself failed; the original failure is what is thrown',
        err: rollbackErr,
      })
    }
    throw asDomainError(err)
  } finally {
    client.release()
  }
}
