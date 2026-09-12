import { NotFound } from '#shared/errors.ts'
import type { SpotPrice, SpotTicker, SpotTrend } from '@dorado/contracts'

export const trendOf = (change: number | null): SpotTrend =>
  change === null || change === 0 ? 'flat' : change > 0 ? 'up' : 'down'

export const ticker = (rows: SpotPrice[]): SpotTicker[] =>
  rows.map((row) => ({ ...row, direction: trendOf(row.dollar_change) }))

export function assertOverrideRemoved(removed: boolean, metal_id: string): void {
  if (!removed) throw new NotFound(`no override for ${metal_id}`)
}
