export type Metal = 'Gold' | 'Silver' | 'Platinum' | 'Palladium'
const METALS: Metal[] = ['Gold', 'Silver', 'Platinum', 'Palladium']

export type PayoutBracket = {
  id: string
  metal: Metal | string
  material: 'scrap' | 'bullion' | string
  payout_pct: number
  min_qty?: number | null
  max_qty?: number | null
  effective_from?: string
  effective_to?: string | null
}

export function topRatesByMetal(rates: PayoutBracket[]) {
  const best = new Map<Metal, PayoutBracket>()
  for (const r of rates) {
    if (!METALS.includes(r.metal as Metal)) continue
    const m = r.metal as Metal
    const prev = best.get(m)
    if (!prev || (r.payout_pct ?? 0) > (prev.payout_pct ?? 0)) {
      best.set(m, r)
    }
  }
  return METALS.map((m) => best.get(m) ?? null)
}

export const pctLabel = (v: number | undefined | null) => {
  if (!v && v !== 0) return '—'
  const pct = v <= 1 ? v * 100 : v
  return `${Math.round(pct)}%`
}
