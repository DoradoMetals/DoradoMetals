import type { RateBandSnapshot, RateBandsBody, RateChangeType, RatePay } from '@dorado/contracts'

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

const bandQuantity = new Intl.NumberFormat('en-US', { maximumFractionDigits: 3 })

export function bandCell(
  band: RateBandSnapshot | null,
  type: RateChangeType,
  unit: (key: string) => string
): string {
  if (!band) return '—'
  const low = bandQuantity.format(band.min_qty)
  const range =
    band.max_qty == null
      ? `${low}+ ${unit(band.unit)}`
      : `${low}–${bandQuantity.format(band.max_qty)} ${unit(band.unit)}`
  return `${range} · ${formatFraction(type === 'scrap' ? band.scrap_pct : band.bullion_pct)}`
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
