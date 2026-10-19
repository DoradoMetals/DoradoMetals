import query from '#shared/db/query.ts'
import { sqlFrom } from '#shared/db/sql.ts'
import { SmsMessageImageMedia } from '@dorado/contracts'
import type { Executor } from '#shared/db/executor.ts'

const sql = sqlFrom(import.meta.dirname)

export async function create(
  message_id: string,
  image_id: string,
  executor?: Executor
): Promise<void> {
  await query(sql('create'), [message_id, image_id], executor)
}

export async function createAt(
  message_id: string,
  image_id: string,
  sort_order: number,
  executor?: Executor
): Promise<void> {
  await query(sql('create_at'), [message_id, image_id, sort_order], executor)
}

export async function linked(
  message_id: string,
  sort_order: number,
  executor?: Executor
): Promise<boolean> {
  const { rows } = await query<{ linked: boolean }>(
    sql('linked'),
    [message_id, sort_order],
    executor
  )
  return rows[0]?.linked ?? false
}

export async function media(
  message_id: string,
  executor?: Executor
): Promise<SmsMessageImageMedia[]> {
  const { rows } = await query(sql('media'), [message_id], executor)
  return rows.map((row) => SmsMessageImageMedia.parse(row))
}
