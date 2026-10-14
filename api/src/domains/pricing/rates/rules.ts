import { Invalid, NotFound } from '#shared/errors.ts'
import type {
  AdminRate,
  Metal,
  RateBand,
  RateBandInput,
  RatePayView,
  RateRead,
  RateTier,
} from '@dorado/contracts'

export function assertRate<T>(row: T | undefined, id: string): asserts row is T {
  if (!row) throw new NotFound(`no rate ${id}`)
}

export function assertMetal(metal: Metal | undefined, metal_id: string): asserts metal is Metal {
  if (!metal) throw new NotFound(`no metal ${metal_id}`)
}

export function assertUnit(view: RatePayView, unit: string): void {
  if (view.unit === null) throw new Invalid(`${unit} is not a weight unit this business quotes in`)
}

export function assertBands(bands: RateBandInput[]): void {
  if (bands.length === 0) throw new Invalid('a metal needs at least one band')
  if (bands[0].min_qty !== 0) {
    throw new Invalid(`the first band starts at ${bands[0].min_qty}; it must start at 0`)
  }
  bands.forEach((band, i) => {
    const last = i === bands.length - 1
    if (band.scrap_pct < 0 || band.bullion_pct < 0) {
      throw new Invalid(`band ${i + 1} pays a negative percentage`)
    }
    if (last && band.max_qty !== null) {
      throw new Invalid(`the last band ends at ${band.max_qty}; it must be open-ended`)
    }
    if (!last && band.max_qty === null) {
      throw new Invalid(`band ${i + 1} is open-ended but is not the last band`)
    }
    if (band.max_qty !== null && band.max_qty <= band.min_qty) {
      throw new Invalid(`band ${i + 1} ends at ${band.max_qty}, at or below where it starts`)
    }
    if (!last && band.max_qty !== bands[i + 1].min_qty) {
      throw new Invalid(
        `band ${i + 1} ends at ${band.max_qty} and band ${i + 2} starts at ` +
          `${bands[i + 1].min_qty}; bands must meet with no gap and no overlap`
      )
    }
  })
}

const keyOf = (min: number, max: number | null, unit: string) => `${min}-${max ?? 'inf'}-${unit}`

const prettyUnit = (unit: string): string => {
  const v = unit.toLowerCase().replace(/_/g, ' ')
  return ['troy oz', 'troy ounce', 'troy ounces', 'oz', 'ounce', 'ounces'].includes(v) ? 'oz' : v
}

const labelOf = (min: number, max: number | null, unit: string): string => {
  const n = new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 })
  return max === null ? `${n.format(min)}+ ${unit}` : `${n.format(min)}–${n.format(max)} ${unit}`
}

const topOf = (bands: RateBand[]): number | null => {
  const pcts = bands.flatMap((b) => [b.scrap_pct, b.bullion_pct])
  return pcts.length === 0 ? null : Math.max(...pcts)
}

export function tiers(rows: RateRead[]): RateTier[] {
  const byMetal = new Map<string, RateTier>()
  for (const row of rows) {
    const unit = prettyUnit(row.unit)
    const tier = byMetal.get(row.metal_id) ?? {
      metal_id: row.metal_id,
      unit,
      bands: [],
      top_pct: null,
    }
    const key = keyOf(row.min_qty, row.max_qty, unit)
    const seen = tier.bands.find((b) => b.key === key)
    if (seen) {
      seen.scrap_pct = row.scrap_pct
      seen.bullion_pct = row.bullion_pct
    } else {
      tier.bands.push({
        key,
        label: labelOf(row.min_qty, row.max_qty, unit),
        min_qty: row.min_qty,
        max_qty: row.max_qty,
        scrap_pct: row.scrap_pct,
        bullion_pct: row.bullion_pct,
      })
    }
    byMetal.set(row.metal_id, tier)
  }
  for (const tier of byMetal.values()) tier.top_pct = topOf(tier.bands)
  return [...byMetal.values()]
}
