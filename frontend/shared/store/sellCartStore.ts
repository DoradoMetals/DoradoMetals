import { SellCartItem } from '@/features/cart/types'
import { Rate } from '@/features/rates/types'
import { getRatePct, sumContentByMetal } from '@/features/rates/utils/resolveRate'
import { convertTroyOz } from '@/shared/utils/convertWeights'
import { create } from 'zustand'
import { persist } from 'zustand/middleware'

// The sell basket, local-first and flat. Nothing here is a price: the quote is.

interface SellCartState {
  items: SellCartItem[]
  rates: Rate[]
  premiums: Record<string, number>
  setRates: (rates: Rate[]) => void
  addItem: (item: SellCartItem) => void
  removeOne: (item: SellCartItem) => void
  removeAll: (item: SellCartItem) => void
  clearCart: () => void
  setItems: (items: SellCartItem[]) => void
  mergeSellCart: (backendItems: SellCartItem[]) => void
}

// Fine metal, for the band preview only.
export function lineContent(item: SellCartItem): number {
  if (item.bullion_id !== null) return 0
  return convertTroyOz(item.pre_melt ?? 0, item.unit ?? 't oz') * (item.purity ?? 0)
}

// The band each lot falls in, tiered by the metal's total across the basket.
function retier(items: SellCartItem[], rates: Rate[]): Record<string, number> {
  if (!rates || rates.length === 0) return {}
  const lots = items.filter((i) => i.bullion_id === null)
  const totals = sumContentByMetal(lots, (i) => i.metal, lineContent)

  const out: Record<string, number> = {}
  for (const lot of lots) {
    const total = totals[String(lot.metal ?? '').toLowerCase()] ?? 0
    const pct = getRatePct(rates, lot.metal ?? '', total, 'scrap')
    if (pct != null) out[lot.id] = pct
  }
  return out
}

function sameLine(a: SellCartItem, b: SellCartItem): boolean {
  if (a.bullion_id !== null || b.bullion_id !== null) return a.bullion_id === b.bullion_id
  return (
    a.metal === b.metal &&
    a.pre_melt === b.pre_melt &&
    a.purity === b.purity &&
    a.unit === b.unit
  )
}

function label(items: SellCartItem[]): SellCartItem[] {
  const seen: Record<string, number> = {}
  return items.map((item) => {
    if (item.bullion_id !== null) return item
    const metal = item.metal ?? 'Item'
    seen[metal] = (seen[metal] ?? 0) + 1
    return { ...item, name: `${metal} Item ${seen[metal]}` }
  })
}

export const sellCartStore = create<SellCartState>()(
  persist(
    (set, get) => ({
      items: [],
      rates: [],
      premiums: {},

      setRates: (rates) => {
        set({ rates, premiums: retier(get().items, rates) })
      },

      addItem: (item) => {
        const items = [...get().items]
        const index = items.findIndex((i) => sameLine(i, item))
        if (index !== -1) {
          items[index] = {
            ...items[index],
            quantity: (items[index].quantity ?? 1) + (item.quantity ?? 1),
          }
        } else {
          items.push({ ...item, quantity: item.quantity ?? 1 })
        }
        const next = label(items)
        set({ items: next, premiums: retier(next, get().rates) })
      },

      removeOne: (item) => {
        const items = [...get().items]
        const index = items.findIndex((i) => sameLine(i, item))
        if (index === -1) return
        const found = items[index]
        if ((found.quantity ?? 1) > 1) {
          items[index] = { ...found, quantity: (found.quantity ?? 1) - 1 }
        } else {
          items.splice(index, 1)
        }
        const next = label(items)
        set({ items: next, premiums: retier(next, get().rates) })
      },

      removeAll: (item) => {
        const next = label(get().items.filter((i) => !sameLine(i, item)))
        set({ items: next, premiums: retier(next, get().rates) })
      },

      clearCart: () => set({ items: [], premiums: {} }),

      setItems: (items: SellCartItem[]) => {
        const next = label(items)
        set({ items: next, premiums: retier(next, get().rates) })
      },

      // On sign-in: the server's copy wins, browser-only lines survive.
      mergeSellCart: (backendItems: SellCartItem[]) => {
        const merged: SellCartItem[] = backendItems.map((item) => ({
          ...item,
          quantity: item.quantity ?? 1,
        }))
        for (const item of get().items) {
          if (!merged.some((i) => sameLine(i, item))) merged.push(item)
        }
        const next = label(merged)
        set({ items: next, premiums: retier(next, get().rates) })
      },
    }),
    {
      name: 'dorado_sell_cart',
      // 2 flattens a stored `{type, data}` basket rather than emptying it.
      version: 2,
      migrate: (persisted: unknown) => {
        const state = persisted as { items?: Record<string, any>[] }
        const items = (state?.items ?? []).flatMap((line) => {
          const data = (line?.data ?? line) as Record<string, any>
          if (!data) return []
          const isProduct = line?.type === 'product' || data.bullion_id != null || !!data.slug
          return [
            {
              id: String(data.id ?? crypto.randomUUID()),
              bullion_id: isProduct ? (data.bullion_id ?? data.id ?? null) : null,
              metal_id: data.metal_id ?? null,
              pre_melt: data.pre_melt ?? null,
              post_melt: data.post_melt ?? null,
              purity: data.purity ?? null,
              unit: data.unit ?? data.gross_unit ?? null,
              quantity: Number(data.quantity ?? 1),
              gross: data.gross ?? null,
              metal: data.metal ?? data.metal_type ?? null,
              name: data.name ?? null,
              image_front: data.image_front ?? null,
              mint_name: data.mint_name ?? null,
            },
          ]
        })
        return { ...state, items } as never
      },
      partialize: (state) => ({ items: state.items }),
    }
  )
)
