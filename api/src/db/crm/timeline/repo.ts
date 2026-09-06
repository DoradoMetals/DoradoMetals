import query from '#shared/db/query.ts'
import { sqlFrom } from '#shared/db/sql.ts'
import type { Executor } from '#shared/db/executor.ts'
import { CustomerTimeline } from '@dorado/contracts'

const sql = sqlFrom(import.meta.dirname)

export async function forCustomer(
  user_id: string,
  executor?: Executor
): Promise<CustomerTimeline[]> {
  const { rows } = await query(sql('for_customer'), [user_id], executor)
  return rows.map((row) => CustomerTimeline.parse(row))
}
