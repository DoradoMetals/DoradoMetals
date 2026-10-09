import { Invalid, NotFound } from '#shared/errors.ts'
import type {
  ActiveSpotSource,
  SpotAdjustmentPatch,
  SpotAdjustmentRead,
  SpotPrice,
  SpotSourceRead,
  SpotTicker,
  SpotTrend,
} from '@dorado/contracts'

export const trendOf = (change: number | null): SpotTrend =>
  change === null || change === 0 ? 'flat' : change > 0 ? 'up' : 'down'

export const ticker = (rows: SpotPrice[]): SpotTicker[] =>
  rows.map((row) => ({ ...row, direction: trendOf(row.dollar_change) }))

export function assertSource(
  source: SpotSourceRead | undefined,
  id: string
): asserts source is SpotSourceRead {
  if (!source) throw new NotFound(`no spot source ${id}`)
}

export function assertActiveSource(
  row: ActiveSpotSource | undefined,
  metal_id: string
): asserts row is ActiveSpotSource {
  if (!row) throw new NotFound(`no active spot source for ${metal_id}`)
}

export function assertAdjustment(
  row: SpotAdjustmentRead | undefined,
  metal_id: string,
  source_id: string
): asserts row is SpotAdjustmentRead {
  if (!row) throw new NotFound(`no adjustment for ${metal_id} on ${source_id}`)
}

export function assertAdjustmentReason(exists: boolean, patch: SpotAdjustmentPatch): void {
  if (!exists && !patch.reason) {
    throw new Invalid('a new adjustment needs a reason saying why the feed is being moved')
  }
}

export function assertAdjustmentRemoved(
  removed: boolean,
  metal_id: string,
  source_id: string
): void {
  if (!removed) throw new NotFound(`no adjustment for ${metal_id} on ${source_id}`)
}
