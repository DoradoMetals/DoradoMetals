import query from '#shared/db/query.ts'
import { sqlFrom } from '#shared/db/sql.ts'
import { RefiningDocument } from '@dorado/contracts'
import type { Executor } from '#shared/db/executor.ts'

const sql = sqlFrom(import.meta.dirname)

export async function list(executor?: Executor): Promise<RefiningDocument[]> {
  const { rows } = await query(sql('list'), [], executor)
  return rows.map((row) => RefiningDocument.parse(row))
}
