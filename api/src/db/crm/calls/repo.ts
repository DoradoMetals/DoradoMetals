import type { PoolClient } from 'pg'
import query from '#shared/db/query.ts'
import { sqlFrom } from '#shared/db/sql.ts'
import type { Executor } from '#shared/db/executor.ts'
import type { Call, CallDirection, CallState } from '@dorado/contracts'

const sql = sqlFrom(import.meta.dirname)

export async function getOne(id: string, executor?: Executor): Promise<Call | undefined> {
  const { rows } = await query<Call>(sql('get_one'), [id], executor)
  return rows[0]
}

export async function getByProviderSid(
  provider_sid: string,
  executor?: Executor
): Promise<Call | undefined> {
  const { rows } = await query<Call>(sql('get_by_provider_sid'), [provider_sid], executor)
  return rows[0]
}

export async function getForUpdate(provider_sid: string, tx: PoolClient): Promise<Call | undefined> {
  const { rows } = await query<Call>(sql('get_for_update'), [provider_sid], tx)
  return rows[0]
}

export async function create(
  provider: string,
  provider_sid: string,
  direction: CallDirection,
  from_number: string,
  to_number: string,
  employee_id: string | null,
  status: CallState,
  customer_number: string,
  tx: PoolClient
): Promise<Call> {
  const { rows } = await query<Call>(
    sql('create'),
    [
      provider,
      provider_sid,
      direction,
      from_number,
      to_number,
      employee_id,
      status,
      customer_number,
    ],
    tx
  )
  return rows[0]
}

export async function applyStatus(
  id: string,
  status: CallState,
  duration_seconds: number | null,
  tx: PoolClient
): Promise<Call> {
  const { rows } = await query<Call>(sql('apply_status'), [id, status, duration_seconds], tx)
  return rows[0]
}

export async function markRecording(
  id: string,
  recording_url: string,
  tx: PoolClient
): Promise<Call> {
  const { rows } = await query<Call>(sql('mark_recording'), [id, recording_url], tx)
  return rows[0]
}

export async function employeeIdForUser(
  user_id: string,
  executor?: Executor
): Promise<{ id: string } | undefined> {
  const { rows } = await query<{ id: string }>(sql('employee_for_user'), [user_id], executor)
  return rows[0]
}

export async function phoneForUser(user_id: string, executor?: Executor): Promise<string | undefined> {
  const { rows } = await query<{ phone_number: string }>(sql('phone_for_user'), [user_id], executor)
  return rows[0]?.phone_number
}

export async function onDutyEmployees(
  executor?: Executor
): Promise<{ id: string; email: string }[]> {
  const { rows } = await query<{ id: string; email: string }>(
    sql('on_duty_employees'),
    [],
    executor
  )
  return rows
}
