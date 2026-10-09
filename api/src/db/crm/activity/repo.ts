import query from '#shared/db/query.ts'
import { sqlFrom } from '#shared/db/sql.ts'
import { DURATION_LABEL } from '#db/crm/calls/repo.ts'
import { ActivityEntry } from '@dorado/contracts'
import type { ActivityFilter } from '@dorado/contracts'
import type { Executor } from '#shared/db/executor.ts'

const sql = sqlFrom(import.meta.dirname)

const LIST_SQL = sql('list').replace('/*__duration_label__*/', DURATION_LABEL)

export async function list(filter: ActivityFilter, executor?: Executor): Promise<ActivityEntry[]> {
  const { rows } = await query(
    LIST_SQL,
    [filter.employee_id ?? null, filter.limit ?? null],
    executor
  )
  return rows.map((row) => ActivityEntry.parse(row))
}
