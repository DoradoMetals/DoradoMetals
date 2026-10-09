import query from '#shared/db/query.ts'
import { sqlFrom } from '#shared/db/sql.ts'
import { ORDER_STATE } from '#db/orders/repo.ts'
import { DURATION_LABEL } from '#db/crm/calls/repo.ts'
import type { Executor } from '#shared/db/executor.ts'
import { CustomerTimeline, LeadTimeline } from '@dorado/contracts'

const sql = sqlFrom(import.meta.dirname)

const FOR_CUSTOMER_SQL = sql('for_customer')
  .replace('/*__order_state__*/', ORDER_STATE)
  .replace('/*__duration_label__*/', DURATION_LABEL)

export async function forCustomer(
  user_id: string,
  executor?: Executor
): Promise<CustomerTimeline[]> {
  const { rows } = await query(FOR_CUSTOMER_SQL, [user_id], executor)
  return rows.map((row) => CustomerTimeline.parse(row))
}

export async function forLead(lead_id: string, executor?: Executor): Promise<LeadTimeline[]> {
  const { rows } = await query(sql('for_lead'), [lead_id], executor)
  return rows.map((row) => LeadTimeline.parse(row))
}
