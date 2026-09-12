import type { PoolClient } from 'pg'
import query from '#shared/db/query.ts'
import { sqlFrom } from '#shared/db/sql.ts'
import type { Executor } from '#shared/db/executor.ts'
import type { SmsMessage } from '@dorado/contracts'
import type { SmsDeliveryStatus } from '@dorado/contracts'
import type { SmsInbound, SmsMedia } from '#providers/communications/twilio/index.ts'

const sql = sqlFrom(import.meta.dirname)

export async function getOne(id: string, executor?: Executor): Promise<SmsMessage | undefined> {
  const { rows } = await query<SmsMessage>(sql('get_one'), [id], executor)
  return rows[0]
}

export async function getByProviderSid(
  provider_sid: string,
  executor?: Executor
): Promise<SmsMessage | undefined> {
  const { rows } = await query<SmsMessage>(sql('get_by_provider_sid'), [provider_sid], executor)
  return rows[0]
}

export async function getForUpdate(
  provider_sid: string,
  tx: PoolClient
): Promise<SmsMessage | undefined> {
  const { rows } = await query<SmsMessage>(sql('get_for_update'), [provider_sid], tx)
  return rows[0]
}

export async function conversation(
  user_id: string | null,
  number: string | null,
  executor?: Executor
): Promise<SmsMessage[]> {
  const { rows } = await query<SmsMessage>(sql('conversation'), [user_id, number], executor)
  return rows
}

export async function upsertInbound(
  input: SmsInbound,
  provider: string,
  tx: PoolClient
): Promise<SmsMessage> {
  const { rows } = await query<SmsMessage>(
    sql('upsert_inbound'),
    [provider, input.provider_sid, input.from_number, input.to_number, input.body, JSON.stringify(input.media)],
    tx
  )
  return rows[0]
}

export async function createOutbound(
  provider: string,
  from_number: string,
  to_number: string,
  body: string,
  media: SmsMedia[],
  tx: PoolClient
): Promise<SmsMessage> {
  const { rows } = await query<SmsMessage>(
    sql('create_outbound'),
    [provider, from_number, to_number, body, JSON.stringify(media)],
    tx
  )
  return rows[0]
}

export async function markSent(
  id: string,
  provider_sid: string,
  tx: PoolClient
): Promise<SmsMessage> {
  const { rows } = await query<SmsMessage>(sql('mark_sent'), [id, provider_sid], tx)
  return rows[0]
}

export async function applyStatus(
  id: string,
  status: SmsDeliveryStatus,
  error_code: string | null,
  tx: PoolClient
): Promise<SmsMessage> {
  const { rows } = await query<SmsMessage>(sql('apply_status'), [id, status, error_code], tx)
  return rows[0]
}
