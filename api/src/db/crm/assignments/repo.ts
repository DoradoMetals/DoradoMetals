import query from '#shared/db/query.ts'
import { sqlFrom } from '#shared/db/sql.ts'
import type { Assignment, AssignmentPatch } from '@dorado/contracts'
import type { Executor } from '#shared/db/executor.ts'

const sql = sqlFrom(import.meta.dirname)

export async function create(row: AssignmentPatch, executor?: Executor): Promise<Assignment> {
  const { rows } = await query<Assignment>(
    sql('create'),
    [row.user_id, row.lead_id, row.assigned_to_id],
    executor
  )
  return rows[0]!
}

export async function forSubject(
  user_id: string | null,
  lead_id: string | null,
  executor?: Executor
): Promise<Assignment[]> {
  const { rows } = await query<Assignment>(sql('for_subject'), [user_id, lead_id], executor)
  return rows
}
