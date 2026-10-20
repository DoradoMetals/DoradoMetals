import query from '#shared/db/query.ts'
import { sqlFrom } from '#shared/db/sql.ts'
import type { FundingSource } from '@dorado/contracts'
import type { Executor } from '#shared/db/executor.ts'

const sql = sqlFrom(import.meta.dirname)

export async function list(executor?: Executor): Promise<FundingSource[]> {
  const { rows } = await query<FundingSource>(sql('list'), [], executor)
  return rows
}

export async function getOne(id: string, executor?: Executor): Promise<FundingSource | undefined> {
  const { rows } = await query<FundingSource>(sql('get_one'), [id], executor)
  return rows[0]
}
