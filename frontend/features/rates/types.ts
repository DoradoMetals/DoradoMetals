// Rate shapes, FROM THE CONTRACTS (phase 3, ruling 39). What stays here is
// the RATE CARD'S OWN CONFIGURATION - slider bounds, percentage labels, sort
// order - which is UI and has no column behind it.
//
// ONE HAND-WRITTEN TYPE WAS STANDING IN FOR TWO WIRE SHAPES. /rates/get_all
// omits the audit columns and /rates/get_admin includes them
// (api/features/rates/wire.ts, RateWire and AdminRateWire), and the type here
// carried the union of both with `metal_id` and `unit` marked optional so it
// could pass for either. RatesCard reads `metal_id` off it. It also typed
// `created_at` / `updated_at` as `Date` against a wire that sends strings.
import type { Rate as RateContract, AdminRate as AdminRateContract } from '@dorado/contracts'

export type Rate = RateContract
export type AdminRate = AdminRateContract

// *** NOT A CONTRACT - D103's second arm, same as leads' LeadPriority. ***
// `metals.name` is plain text; these four names are the metals THE RATE CARD
// RENDERS, and METAL_BOUNDS below keys its sliders by them. A UI list, kept
// beside the UI that reads it.
export type Metal = 'Gold' | 'Silver' | 'Platinum' | 'Palladium'
export const METALS: Metal[] = ['Gold', 'Silver', 'Platinum', 'Palladium']

const bandTopPct = (r?: Rate | null) =>
  r ? Math.max(r.scrap_pct ?? -Infinity, r.bullion_pct ?? -Infinity) : -Infinity

export function topRatesByMetal(rates: Rate[]) {
  const best = new Map<Metal, Rate>()
  const bestPct = new Map<Metal, number>()

  for (const r of rates) {
    const m = r.metal as Metal
    if (!METALS.includes(m)) continue

    const pct = bandTopPct(r)
    const prev = bestPct.get(m) ?? -Infinity
    if (pct > prev) {
      best.set(m, r)
      bestPct.set(m, pct)
    }
  }
  return METALS.map((m) => best.get(m) ?? null)
}

export const pctLabel = (v: number | undefined | null) => {
  if (!v && v !== 0) return '—'
  const pct = v <= 1 ? v * 100 : v
  return `${Math.round(pct)}%`
}

export const labelFor = (v: number | undefined, cap: number) =>
  v == null || v >= cap ? '∞' : String(v)

export const METAL_BOUNDS: Record<Metal, { cap: number; step: number }> = {
  Gold: { cap: 30, step: 1 },
  Silver: { cap: 3000, step: 25 },
  Platinum: { cap: 50, step: 5 },
  Palladium: { cap: 50, step: 5 },
}

export const getBoundsForMetal = (metal: string) => {
  const key = metal as Metal
  return METAL_BOUNDS[key] ?? { cap: 100000, step: 1 }
}

export const pctToInt = (n: number | undefined) => Math.round((n ?? 0) * 100)

export const intToPct = (n: number) => Math.max(0, Math.min(100, n)) / 100

// GENERIC OVER THE RATE SHAPE, because there are two of them and this only
// reads `min_qty`. Typed as `Rate[]` it silently downcast the admin rows the
// card holds, which is how `metal_id` went missing from a value that has one.
export const sortRatesByMin = <T extends { min_qty: number }>(rates: T[]): T[] =>
  [...rates].sort((a, b) => a.min_qty - b.min_qty)
