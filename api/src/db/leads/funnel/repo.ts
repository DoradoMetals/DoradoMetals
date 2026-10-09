import query from '#shared/db/query.ts'
import { sqlFrom } from '#shared/db/sql.ts'
import { LeadFunnel } from '@dorado/contracts'
import type { Executor } from '#shared/db/executor.ts'

const sql = sqlFrom(import.meta.dirname)

export async function get(executor?: Executor): Promise<LeadFunnel> {
  const { rows } = await query<{ funnel: unknown }>(sql('funnel'), [], executor)
  return LeadFunnel.parse(rows[0]?.funnel)
}
