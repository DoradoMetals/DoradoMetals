import query from '#shared/db/query.ts'
import { buildUpdate } from '#shared/db/patch.ts'
import { expression, sqlFrom } from '#shared/db/sql.ts'
import { columnsOf, returningOf, ACTOR_IDS } from '#shared/db/columns.ts'
import { Lead, LeadPatch } from '@dorado/contracts'
import type { LeadFilter, LeadView, SmsConsentMethod } from '@dorado/contracts'
import type { Executor } from '#shared/db/executor.ts'

const sql = sqlFrom(import.meta.dirname)

export const LEAD_STAGE = expression(sql('lead_stage'))

const GET_ONE_SQL = sql('get_one').replaceAll('/*__lead_stage__*/', LEAD_STAGE)
const GET_ALL_SQL = sql('get_all').replaceAll('/*__lead_stage__*/', LEAD_STAGE)
const CREATE_SQL = sql('create').replaceAll('/*__lead_stage__*/', LEAD_STAGE)
const BY_PHONE_SQL = sql('by_phone').replaceAll('/*__lead_stage__*/', LEAD_STAGE)
const RECORD_SMS_CONSENT_SQL = sql('record_sms_consent').replaceAll(
  '/*__lead_stage__*/',
  LEAD_STAGE
)
const CLEAR_SMS_CONSENT_SQL = sql('clear_sms_consent').replaceAll('/*__lead_stage__*/', LEAD_STAGE)
const MARK_CONVERTED_SQL = sql('mark_converted').replaceAll('/*__lead_stage__*/', LEAD_STAGE)

export const PATCHABLE = columnsOf(LeadPatch)

const RETURNING = `${returningOf(Lead.omit(ACTOR_IDS))}, ${LEAD_STAGE} AS lead_stage`

export async function getOne(id: string, executor?: Executor): Promise<LeadView | undefined> {
  const { rows } = await query<LeadView>(GET_ONE_SQL, [id], executor)
  return rows[0]
}

export async function byPhone(phone: string, executor?: Executor): Promise<LeadView | undefined> {
  const { rows } = await query<LeadView>(BY_PHONE_SQL, [phone], executor)
  return rows[0]
}

export async function list(filter: LeadFilter, executor?: Executor): Promise<LeadView[]> {
  const { rows } = await query<LeadView>(
    GET_ALL_SQL,
    [filter.stage, filter.priority, filter.assigned_to, filter.source, filter.search],
    executor
  )
  return rows
}

export async function create(row: LeadPatch, executor?: Executor): Promise<LeadView> {
  const { rows } = await query<LeadView>(
    CREATE_SQL,
    [
      row.name,
      row.phone,
      row.email,
      row.priority,
      row.source,
      row.assigned_to_id,
      row.source_id,
      row.contact_preference_id,
    ],
    executor
  )
  return rows[0]
}

export async function update(
  id: string,
  patch: LeadPatch,
  executor?: Executor
): Promise<LeadView | undefined> {
  const built = buildUpdate({
    table: 'leads.leads',
    allowed: PATCHABLE,
    patch,
    where: { id },
    returning: RETURNING,
  })
  if (!built) return await getOne(id, executor)
  const { rows } = await query<LeadView>(built.text, built.values, executor)
  return rows[0]
}

export async function remove(id: string, executor?: Executor): Promise<boolean> {
  const { rowCount } = await query(sql('delete'), [id], executor)
  return rowCount === 1
}

export async function recordSmsConsent(
  id: string,
  method: SmsConsentMethod,
  at: string,
  executor?: Executor
): Promise<LeadView | undefined> {
  const { rows } = await query<LeadView>(RECORD_SMS_CONSENT_SQL, [id, method, at], executor)
  return rows[0]
}

export async function clearSmsConsent(
  id: string,
  executor?: Executor
): Promise<LeadView | undefined> {
  const { rows } = await query<LeadView>(CLEAR_SMS_CONSENT_SQL, [id], executor)
  return rows[0]
}

export async function markConverted(
  id: string,
  executor?: Executor
): Promise<LeadView | undefined> {
  const { rows } = await query<LeadView>(MARK_CONVERTED_SQL, [id], executor)
  return rows[0]
}
