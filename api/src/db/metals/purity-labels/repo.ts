import query from '#shared/db/query.ts'
import { sqlFrom } from '#shared/db/sql.ts'
import type { Executor } from '#shared/db/executor.ts'
import type { PurityLabel } from '@dorado/contracts'

const sql = sqlFrom(import.meta.dirname)

export async function list(executor?: Executor): Promise<PurityLabel[]> {
  const { rows } = await query<PurityLabel>(sql('get_all'), [], executor)
  return rows
}
