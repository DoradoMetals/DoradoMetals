import * as assignments from '#db/crm/assignments/repo.ts'
import type { Assignment, AssignmentPatch } from '@dorado/contracts'
import type { Executor } from '#shared/db/executor.ts'

export async function record(row: AssignmentPatch, tx: Executor): Promise<Assignment> {
  return await assignments.create(row, tx)
}
