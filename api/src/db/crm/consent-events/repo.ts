import query from '#shared/db/query.ts'
import { sqlFrom } from '#shared/db/sql.ts'
import type { SmsConsentEvent, SmsConsentEventPatch } from '@dorado/contracts'
import type { Executor } from '#shared/db/executor.ts'

const sql = sqlFrom(import.meta.dirname)

export async function create(
  row: SmsConsentEventPatch,
  executor?: Executor
): Promise<SmsConsentEvent> {
  const { rows } = await query<SmsConsentEvent>(
    sql('create'),
    [row.user_id, row.lead_id, row.kind, row.method],
    executor
  )
  return rows[0]!
}

export async function forSubject(
  user_id: string | null,
  lead_id: string | null,
  executor?: Executor
): Promise<SmsConsentEvent[]> {
  const { rows } = await query<SmsConsentEvent>(sql('for_subject'), [user_id, lead_id], executor)
  return rows
}
