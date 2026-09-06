import query from '#shared/db/query.ts'
import { sqlFrom } from '#shared/db/sql.ts'
import type { FeedCursor } from '@dorado/contracts'
import type { Executor } from '#shared/db/executor.ts'

const sql = sqlFrom(import.meta.dirname)

export async function getOne(source: string, executor?: Executor): Promise<FeedCursor | undefined> {
  const { rows } = await query<FeedCursor>(sql('get_one'), [source], executor)
  return rows[0]
}

export async function save(
  source: string,
  cursor: string,
  executor?: Executor
): Promise<FeedCursor> {
  const { rows } = await query<FeedCursor>(sql('save'), [source, cursor], executor)
  return rows[0] as FeedCursor
}
