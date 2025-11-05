export type Metal = 'Gold' | 'Silver' | 'Platinum' | 'Palladium'
const METALS: Metal[] = ['Gold', 'Silver', 'Platinum', 'Palladium']

export type Rate = {
  id: string
  metal_id?: string
  metal: Metal | string
  material: 'scrap' | 'bullion' | string
  unit?: string
  scrap_pct: number
  bullion_pct: number
  min_qty: number
  max_qty: number | null
  created_by: string
  updated_by: string
  created_at: Date
  updated_at: Date
}

const bandTopPct = (r?: Rate | null) =>
  r ? Math.max(r.scrap_pct ?? -Infinity, r.bullion_pct ?? -Infinity) : -Infinity

export function topRatesByMetal(rates: Rate[]) {
  const best = new Map<Metal, Rate>()
  const bestPct = new Map<Metal, number>()

  for (const r of rates) {
    const m = r.metal as Metal
    if (!METALS.includes(m)) continue

    const pct = bandTopPct(r) // 0..1
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
