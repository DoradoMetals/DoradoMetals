import query from '#shared/db/query.ts'
import { sqlFrom } from '#shared/db/sql.ts'
import { EmployeeSummary } from '@dorado/contracts'
import type { Executor } from '#shared/db/executor.ts'

const sql = sqlFrom(import.meta.dirname)

export async function getAll(executor?: Executor): Promise<EmployeeSummary[]> {
  const { rows } = await query(sql('get_all'), [], executor)
  return rows.map((row) => EmployeeSummary.parse(row))
}
