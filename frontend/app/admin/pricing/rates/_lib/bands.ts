import type { RateBandsBody, RateChangeRow, RatePay } from '@dorado/contracts'

import { formatFraction } from './format'

export type DraftBand = { max: string; scrap: string; bullion: string }

const percentText = new Intl.NumberFormat('en-US', {
  style: 'percent',
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
  useGrouping: false,
})

export const asPercentText = (fraction: number): string =>
  percentText.format(fraction).replace('%', '')

export const asFraction = (text: string): number => Number(`${text.trim()}e-2`)

export const toDrafts = (bands: RatePay[]): DraftBand[] =>
  bands.map((band) => ({
    max: band.max_qty == null ? '' : String(band.max_qty),
    scrap: asPercentText(band.scrap_pct),
    bullion: asPercentText(band.bullion_pct),
  }))

export const draftMin = (drafts: DraftBand[], index: number): string =>
  index === 0 ? '0' : drafts[index - 1].max || '?'

export const toBody = (drafts: DraftBand[]): RateBandsBody => ({
  bands: drafts.map((draft, index) => ({
    min_qty: index === 0 ? 0 : Number(drafts[index - 1].max),
    max_qty: index === drafts.length - 1 ? null : Number(draft.max),
    scrap_pct: asFraction(draft.scrap),
    bullion_pct: asFraction(draft.bullion),
  })),
})

const isPercentField = (field: string) => field === 'scrap_pct' || field === 'bullion_pct'

export function changeText(row: Pick<RateChangeRow, 'field' | 'old_value' | 'new_value'>): string {
  const show = (value: string | null) =>
    value == null ? 'none' : isPercentField(row.field) ? formatFraction(Number(value)) : value
  return `${show(row.old_value)} to ${show(row.new_value)}`
}

export function lastChange<T extends { metal_id: string; updated_at: string }>(
  rows: T[],
  metalId: string
): T | undefined {
  return rows
    .filter((row) => row.metal_id === metalId)
    .reduce<T | undefined>(
      (latest, row) => (!latest || row.updated_at > latest.updated_at ? row : latest),
      undefined
    )
}
