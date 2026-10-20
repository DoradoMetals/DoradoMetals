import query from '#shared/db/query.ts'
import { sqlFrom } from '#shared/db/sql.ts'
import { LeadLookup } from '@dorado/contracts'
import type { Executor } from '#shared/db/executor.ts'

const sql = sqlFrom(import.meta.dirname)

export async function list(executor?: Executor): Promise<LeadLookup[]> {
  const { rows } = await query(sql('get_all'), [], executor)
  return rows.map((row) => LeadLookup.parse(row))
}

export async function getOne(id: string, executor?: Executor): Promise<LeadLookup | null> {
  const { rows } = await query(sql('get_one'), [id], executor)
  return rows[0] ? LeadLookup.parse(rows[0]) : null
}
