import query from '#shared/db/query.ts'
import { sqlFrom } from '#shared/db/sql.ts'
import type { Executor } from '#shared/db/executor.ts'
import type { SpotPatch } from '@dorado/contracts'

const sql = sqlFrom(import.meta.dirname)

export async function upsert(
  source_id: string,
  quote: SpotPatch,
  executor?: Executor
): Promise<boolean> {
  const { rows } = await query<{ changed: boolean }>(
    sql('upsert'),
    [source_id, quote.metal_id, quote.bid, quote.ask, quote.dollar_change, quote.percent_change],
    executor
  )
  return rows[0]?.changed ?? false
}
