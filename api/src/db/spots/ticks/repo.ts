import query from '#shared/db/query.ts'
import { sqlFrom } from '#shared/db/sql.ts'
import type { Executor } from '#shared/db/executor.ts'

const sql = sqlFrom(import.meta.dirname)

export async function addPartitions(executor?: Executor): Promise<number> {
  const { rows } = await query<{ made: number }>(sql('add_partitions'), [], executor)
  return rows[0]?.made ?? 0
}

export async function dropExpired(executor?: Executor): Promise<number> {
  const { rows } = await query<{ dropped: number }>(sql('drop_expired'), [], executor)
  return rows[0]?.dropped ?? 0
}
