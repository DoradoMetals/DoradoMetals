import { Product } from '@/features/products/types'
import { assignScrapItemNames, Scrap } from '@/features/scrap/types'
import { SellCartItem } from '@/features/cart/types'
import { Rate } from '@/features/rates/types'
import { getRatePct, sumContentByMetal } from '@/features/rates/utils/resolveRate'
import { create } from 'zustand'
import { persist } from 'zustand/middleware'

interface SellCartState {
  items: SellCartItem[]
  rates: Rate[]
  setRates: (rates: Rate[]) => void
  addItem: (item: SellCartItem) => void
  removeOne: (item: SellCartItem) => void
  removeAll: (item: SellCartItem) => void
  clearCart: () => void
  setItems: (items: SellCartItem[]) => void
  mergeSellCart: (backendItems: SellCartItem[]) => void
}

// Re-price scrap items from the rates table, tiered by the TOTAL scrap content
// of each metal across the cart. Keeps the customer's preview premium in sync
// with what the backend will enforce at order creation. No-op without rates or
// when a metal has no rate band (leaves the existing bid_premium).
function retierScrap(items: SellCartItem[], rates: Rate[]): SellCartItem[] {
  if (!rates || rates.length === 0) return items

  const scrapItems = items.filter((i) => i.type === 'scrap')
  const totalsByMetal = sumContentByMetal(
    scrapItems,
    (i) => (i.data as Scrap).metal ?? null,
    (i) => (i.data as Scrap).content ?? 0
  )

  return items.map((i) => {
    if (i.type !== 'scrap') return i
    const scrap = i.data as Scrap
    const total = totalsByMetal[String(scrap.metal ?? '').toLowerCase()] ?? 0
    const pct = getRatePct(rates, scrap.metal, total, 'scrap')
    if (pct == null) return i
    return { type: 'scrap' as const, data: { ...scrap, bid_premium: pct } }
  })
}

function addWithQuantity(item: SellCartItem): SellCartItem {
  if (item.type === 'product') {
    return {
      type: 'product' as const,
      data: { ...(item.data as Product), quantity: (item.data.quantity ?? 1) },
    }
  } else {
    return {
      type: 'scrap' as const,
      data: { ...(item.data as Scrap), quantity: (item.data.quantity ?? 1) },
    }
  }
}

function normalizeScrapNames(items: SellCartItem[]): SellCartItem[] {
  const products = items.filter((i) => i.type === 'product')
  const scrap = items.filter((i) => i.type === 'scrap')

  const renamedScrap = assignScrapItemNames(scrap.map((i) => i.data as Scrap))

  return [
    ...products,
    ...renamedScrap.map((data) => ({
      type: 'scrap' as const,
      data,
    })),
  ]
}

function scrapMatches(a: Scrap, b: Scrap): boolean {
  // bid_premium is a derived (rate-tiered) value, not an intrinsic property, so
  // it is intentionally excluded — otherwise re-tiering would break merging.
  return (
    a.pre_melt === b.pre_melt &&
    a.purity === b.purity &&
    a.gross_unit === b.gross_unit &&
    a.metal === b.metal
  )
}

// Same persisted-rename note as cartStore: a sell-cart line's product data
// may predate the products rename in a customer's localStorage.
const renameLegacySellLine = (line: Record<string, unknown>): Record<string, unknown> => {
  if (!line || typeof line !== 'object') return line
  const data = line.data as Record<string, unknown> | undefined
  if (!data || !('product_name' in data)) return line
  const { product_name, product_description, product_type, ...rest } = data
  return { ...line, data: { ...rest, name: product_name, description: product_description, type: product_type } }
}

export const sellCartStore = create<SellCartState>()(
  persist(
    (set, get) => ({
      items: [],
      rates: [],

      setRates: (rates) => {
        set({ rates, items: retierScrap(get().items, rates) })
      },

      addItem: (item) => {
        let items = [...get().items]

        const match = (a: SellCartItem, b: SellCartItem) => {
          if (a.type !== b.type) return false
          if (a.type === 'product') return a.data.name === (b.data as Product).name
          if (a.type === 'scrap') return scrapMatches(a.data as Scrap, b.data as Scrap)
          return false
        }

        const existing = items.find((i) => match(i, item))
        if (existing) {
          existing.data.quantity = (existing.data.quantity ?? 0) + (item.data.quantity ?? 1)
        } else {
          items.push(addWithQuantity(item))
        }

        set({ items: retierScrap(normalizeScrapNames(items), get().rates) })
      },

      removeOne: (item) => {
        let items = [...get().items]

        const index = items.findIndex((i) => {
          if (i.type !== item.type) return false
          if (i.type === 'product')
            return i.data.name === (item.data as Product).name
          if (i.type === 'scrap') return scrapMatches(i.data as Scrap, item.data as Scrap)
          return false
        })

        if (index !== -1) {
          const found = items[index]
          const currentQty = found.data.quantity || 1
          if (currentQty > 1) {
            found.data.quantity = currentQty - 1
          } else {
            items.splice(index, 1)
          }
          set({ items: retierScrap(normalizeScrapNames(items), get().rates) })
        }
      },

      removeAll: (item) => {
        const filtered = get().items.filter((i) => {
          if (i.type !== item.type) return true
          if (i.type === 'product')
            return i.data.name !== (item.data as Product).name
          if (i.type === 'scrap') return !scrapMatches(i.data as Scrap, item.data as Scrap)
          return true
        })
        set({ items: retierScrap(normalizeScrapNames(filtered), get().rates) })
      },

      clearCart: () => set({ items: [] }),

      setItems: (items: SellCartItem[]) => set({ items: retierScrap(items, get().rates) }),

      mergeSellCart: (backendItems: SellCartItem[]) => {
        const localItems = get().items
        const mergedItems: SellCartItem[] = []

        const isProductMatch = (a: SellCartItem, b: SellCartItem) =>
          a.type === 'product' &&
          b.type === 'product' &&
          (a.data as Product).name === (b.data as Product).name

        const isScrapMatch = (a: SellCartItem, b: SellCartItem) =>
          a.type === 'scrap' && b.type === 'scrap' && scrapMatches(a.data as Scrap, b.data as Scrap)

        backendItems.forEach((backendItem) => {
          if (backendItem.type === 'product') {
            mergedItems.push({
              type: 'product',
              data: {
                ...(backendItem.data as Product),
                quantity: backendItem.data.quantity || 1,
              },
            })
          } else {
            const alreadyInLocal = localItems.some((i) => isScrapMatch(i, backendItem))
            if (!alreadyInLocal) {
              mergedItems.push({
                type: 'scrap',
                data: {
                  ...(backendItem.data as Scrap),
                  quantity: 1,
                },
              })
            }
          }
        })

        localItems.forEach((localItem) => {
          const alreadyMerged = mergedItems.find((merged) => {
            return isProductMatch(merged, localItem) || isScrapMatch(merged, localItem)
          })

          if (!alreadyMerged) {
            if (localItem.type === 'product') {
              mergedItems.push({
                type: 'product',
                data: {
                  ...(localItem.data as Product),
                  quantity: localItem.data.quantity || 1,
                },
              })
            } else {
              mergedItems.push({
                type: 'scrap',
                data: {
                  ...(localItem.data as Scrap),
                  quantity: 1,
                },
              })
            }
          }
        })

        set({ items: retierScrap(normalizeScrapNames(mergedItems), get().rates) })
      },
    }),
    {
      name: 'dorado_sell_cart',
      version: 1,
      migrate: (persisted: unknown) => {
        const state = persisted as { items?: Record<string, unknown>[] }
        return { ...state, items: (state?.items ?? []).map(renameLegacySellLine) } as never
      },
      partialize: (state) => ({ items: state.items }),
    }
  )
)
