import * as employees from '#db/auth/employees/repo.ts'
import type { Executor } from '#shared/db/executor.ts'
import type { EmployeeSummary } from '@dorado/contracts'

export async function list(executor?: Executor): Promise<EmployeeSummary[]> {
  return await employees.getAll(executor)
}
