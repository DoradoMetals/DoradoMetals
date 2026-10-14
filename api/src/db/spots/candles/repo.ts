import query from '#shared/db/query.ts'
import { sqlFrom } from '#shared/db/sql.ts'
import type { Executor } from '#shared/db/executor.ts'
import { SpotCandle, type SpotCandleRange } from '@dorado/contracts'

const sql = sqlFrom(import.meta.dirname)
const SpotCandles = SpotCandle.array()

export async function roll(
  source_id: string,
  metal_id: string,
  executor?: Executor
): Promise<void> {
  await query(sql('roll_hours'), [source_id, metal_id], executor)
  await query(sql('roll_days'), [source_id, metal_id], executor)
}

export async function list(
  metal_id: string,
  source_id: string | null,
  range: SpotCandleRange,
  executor?: Executor
): Promise<SpotCandle[]> {
  const { rows } = await query<{ candles: unknown }>(
    sql('list'),
    [metal_id, source_id, range],
    executor
  )
  return SpotCandles.parse(rows[0]?.candles ?? [])
}

export async function prune(executor?: Executor): Promise<number> {
  const { rows } = await query<{ deleted: number }>(sql('prune'), [], executor)
  return rows[0]?.deleted ?? 0
}
