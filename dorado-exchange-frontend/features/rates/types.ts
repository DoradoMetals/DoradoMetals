// types/rates.ts

export type Metal = 'Gold' | 'Silver' | 'Platinum' | 'Palladium'
export const METALS: Metal[] = ['Gold', 'Silver', 'Platinum', 'Palladium']

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

export const sortRatesByMin = (rates: Rate[]): Rate[] =>
  [...rates].sort((a, b) => a.min_qty - b.min_qty)
