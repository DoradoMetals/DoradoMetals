import query from '#shared/db/query.ts'
import { sqlFrom } from '#shared/db/sql.ts'
import type { Executor } from '#shared/db/executor.ts'
import type { ActionReason, ActionReasonWrite } from '@dorado/contracts'

const sql = sqlFrom(import.meta.dirname)

export async function create(row: ActionReasonWrite, executor?: Executor): Promise<ActionReason> {
  const { rows } = await query<ActionReason>(
    sql('create'),
    [row.order_id, row.action, row.reason],
    executor
  )
  return rows[0]!
}

export async function listFor(order_id: string, executor?: Executor): Promise<ActionReason[]> {
  const { rows } = await query<ActionReason>(sql('list_for'), [order_id], executor)
  return rows
}
