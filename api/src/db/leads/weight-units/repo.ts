import query from '#shared/db/query.ts'
import { sqlFrom } from '#shared/db/sql.ts'
import { WeightUnitLookup } from '@dorado/contracts'
import type { Executor } from '#shared/db/executor.ts'

const sql = sqlFrom(import.meta.dirname)

export async function list(executor?: Executor): Promise<WeightUnitLookup[]> {
  const { rows } = await query(sql('get_all'), [], executor)
  return rows.map((row) => WeightUnitLookup.parse(row))
}
