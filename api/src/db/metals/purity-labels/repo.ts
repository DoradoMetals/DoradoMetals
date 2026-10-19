import query from '#shared/db/query.ts'
import { sqlFrom } from '#shared/db/sql.ts'
import type { Executor } from '#shared/db/executor.ts'
import { PurityLookup } from '@dorado/contracts'
import type { PurityLabel } from '@dorado/contracts'

const sql = sqlFrom(import.meta.dirname)

export async function list(executor?: Executor): Promise<PurityLabel[]> {
  const { rows } = await query<PurityLabel>(sql('get_all'), [], executor)
  return rows
}

export async function lookup(executor?: Executor): Promise<PurityLookup[]> {
  const { rows } = await query(sql('lookup'), [], executor)
  return rows.map((row) => PurityLookup.parse(row))
}
