import { Rate } from '@/features/rates/types'

export type RateMaterial = 'scrap' | 'bullion'

/**
 * Rate resolution for quantity-tiered pricing.
 *
 * Rates are banded per metal by [min_qty, max_qty] (max_qty null = open-ended).
 * Pricing is tiered on the TOTAL quantity of a metal across the whole order
 * (decided product-side), so callers must pass the order-total for the metal,
 * not a single line's content.
 *
 * `scrap_pct` / `bullion_pct` are stored as fractions (0–1), so the result
 * plugs straight into `bid_spot * premium`.
 *
 * NOTE: this file is mirrored 1:1 in the API at
 * `api/features/rates/utils/resolveRate.ts` (it was `.js` until the TypeScript
 * conversion). The two are held in sync by
 * `api/features/rates/utils/mirror.test.js`, which compares the shared
 * functions and fails if they drift — one of these quotes a customer a payout
 * rate and the other pays it.
 */

const normMetal = (m: unknown) => String(m ?? '').trim().toLowerCase()

/**
 * Format a premium fraction (0–1) as a payout-rate label, e.g. 0.9 -> "90%",
 * 0.925 -> "92.5%". Accepts already-percent values (> 1) too.
 */
export function formatRate(v: number | null | undefined): string {
  if (v == null) return '—'
  const pct = v <= 1 ? v * 100 : v
  return `${Number(pct.toFixed(2))}%`
}

/**
 * Pick the band for a metal given the total quantity of that metal.
 * - qty inside a band → that band
 * - qty below the lowest band → the lowest band
 * - qty above the highest band → the highest band
 */
export function getRateBand(
  rates: Rate[],
  metal: string,
  totalQty: number
): Rate | null {
  const bands = rates
    .filter((r) => normMetal(r.metal) === normMetal(metal))
    .sort((a, b) => a.min_qty - b.min_qty)

  if (bands.length === 0) return null

  const hit = bands.find(
    (r) => totalQty >= r.min_qty && (r.max_qty == null || totalQty <= r.max_qty)
  )
  if (hit) return hit

  if (totalQty < bands[0].min_qty) return bands[0]
  return bands[bands.length - 1]
}

/**
 * Resolve the premium fraction (0–1) for a metal at a given order-total qty.
 * Returns undefined when no band exists (caller decides the fallback).
 */
export function getRatePct(
  rates: Rate[] | undefined | null,
  metal: string,
  totalQty: number,
  material: RateMaterial
): number | undefined {
  if (!rates || rates.length === 0) return undefined
  const band = getRateBand(rates, metal, totalQty)
  if (!band) return undefined
  const pct = material === 'scrap' ? band.scrap_pct : band.bullion_pct
  return pct == null ? undefined : Number(pct)
}

/**
 * Sum content per metal (lowercased metal key → total content) so callers can
 * feed order-total quantities into the band lookup.
 */
export function sumContentByMetal<T>(
  items: T[],
  getMetal: (i: T) => string | null,
  getContent: (i: T) => number
): Record<string, number> {
  const totals: Record<string, number> = {}
  for (const it of items) {
    const metal = getMetal(it)
    if (!metal) continue
    const key = normMetal(metal)
    totals[key] = (totals[key] ?? 0) + (Number(getContent(it)) || 0)
  }
  return totals
}
