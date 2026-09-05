// Rate shapes, FROM THE CONTRACTS. What is left here is FORMATTING and the
// admin card's own slider configuration - the two things with no column behind
// them.
//
// WHAT LEFT. `topRatesByMetal`, `sortRatesByMin`, `METALS` and `METAL_BOUNDS`'
// grouping partner all decided what a customer is told we pay; the server
// answers that as `RateTier` now (GET /rates/tiers), already grouped,
// deduped, labelled and ordered, with `top_pct` for the landing strip.
//
// AND `utils/resolveRate.ts` IS GONE. It carried `getRateBand`, `getRatePct`
// and `sumContentByMetal` - three functions duplicated from the API and held
// in step by `api/shared/tests/mirror.test.ts`, because one side quoted a
// customer a payout rate and the other paid it. NOTHING in the browser called
// them: every rate a customer sees comes from a /quotes endpoint. Deleting the
// copy retires the drift risk rather than policing it.
import type { AdminRate, RateRead } from '@dorado/contracts'

export type Rate = RateRead

// A premium fraction (0-1) as a percentage. `pctLabel` rounds to a whole
// number for a headline; `formatRate` keeps two decimals where the exact rate
// matters (an order's payout line). Both accept an already-percent value.
export const pctLabel = (v: number | undefined | null) => {
  if (!v && v !== 0) return '—'
  const pct = v <= 1 ? v * 100 : v
  return `${Math.round(pct)}%`
}

export const formatRate = (v: number | null | undefined): string => {
  if (v == null) return '—'
  const pct = v <= 1 ? v * 100 : v
  return `${Number(pct.toFixed(2))}%`
}

// *** NOT A CONTRACT - D103's second arm, same as leads' LeadPriority. ***
// `metals.name` is plain text; these four names are the metals THE ADMIN RATE
// CARD renders sliders for, and METAL_BOUNDS keys its ranges by them. A UI
// list, kept beside the UI that reads it.
export type Metal = 'Gold' | 'Silver' | 'Platinum' | 'Palladium'

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

export type { AdminRate }
