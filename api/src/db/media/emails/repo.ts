import query from '#shared/db/query.ts'
import { sqlFrom } from '#shared/db/sql.ts'
import type { Email } from '@dorado/contracts'
import type { Executor } from '#shared/db/executor.ts'

const sql = sqlFrom(import.meta.dirname)

export type NewEmail = {
  kind: Email['kind']
  status: Email['status']
  to_address: string
  subject: string | null
  order_id: string | null
  user_id?: string | null
  pdf_id?: string | null
  provider_message_id?: string | null
  error?: string | null
}

export async function hasSent(
  order_id: string,
  kinds: readonly Email['kind'][],
  executor?: Executor
): Promise<boolean> {
  const { rows } = await query<{ present: boolean }>(sql('has_sent'), [order_id, kinds], executor)
  return rows[0]?.present === true
}

export async function create(row: NewEmail, executor?: Executor): Promise<{ id: string }> {
  const { rows } = await query<{ id: string }>(
    sql('create'),
    [
      row.kind,
      row.status,
      row.to_address,
      row.subject,
      row.order_id,
      row.user_id,
      row.pdf_id,
      row.provider_message_id,
      row.error,
    ],
    executor
  )
  return rows[0]
}
