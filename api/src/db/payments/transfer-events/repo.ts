import query from '#shared/db/query.ts'
import { sqlFrom } from '#shared/db/sql.ts'
import type { TransferEvent, TransferEventWrite } from '@dorado/contracts'
import type { Executor } from '#shared/db/executor.ts'

const sql = sqlFrom(import.meta.dirname)

export async function record(
  row: TransferEventWrite,
  executor?: Executor
): Promise<TransferEvent | undefined> {
  const { rows } = await query<TransferEvent>(
    sql('record'),
    [
      row.transfer_id ?? null,
      row.provider,
      row.event_id,
      row.event_type,
      row.provider_ref ?? null,
      row.reported_state ?? null,
      row.failure_reason ?? null,
      row.occurred_at ?? null,
    ],
    executor
  )
  return rows[0]
}

export async function getOne(id: string, executor?: Executor): Promise<TransferEvent | undefined> {
  const { rows } = await query<TransferEvent>(sql('get_one'), [id], executor)
  return rows[0]
}

export async function listForTransfer(
  transfer_id: string,
  executor?: Executor
): Promise<TransferEvent[]> {
  const { rows } = await query<TransferEvent>(sql('list_for_transfer'), [transfer_id], executor)
  return rows
}

export async function attach(
  id: string,
  transfer_id: string | null,
  applied: boolean,
  executor?: Executor
): Promise<boolean> {
  const { rowCount } = await query(sql('attach'), [id, transfer_id, applied], executor)
  return rowCount === 1
}
