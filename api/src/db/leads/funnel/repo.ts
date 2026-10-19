import query from '#shared/db/query.ts'
import { sqlFrom } from '#shared/db/sql.ts'
import { LeadFunnel, LeadSummary } from '@dorado/contracts'
import type { LeadSummaryWindow } from '@dorado/contracts'
import type { Executor } from '#shared/db/executor.ts'

const sql = sqlFrom(import.meta.dirname)

export async function get(executor?: Executor): Promise<LeadFunnel> {
  const { rows } = await query<{ funnel: unknown }>(sql('funnel'), [], executor)
  return LeadFunnel.parse(rows[0]?.funnel)
}

export async function summary(
  window: LeadSummaryWindow,
  executor?: Executor
): Promise<LeadSummary> {
  const { rows } = await query<{ summary: unknown }>(
    sql('summary'),
    [window.created_from ?? null, window.created_to ?? null],
    executor
  )
  return LeadSummary.parse(rows[0]?.summary)
}
