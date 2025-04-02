import { Product } from '@/types/product'
import { assignScrapItemNames, Scrap } from '@/types/scrap'
import { SellCartItem } from '@/types/sellCart'
import { create } from 'zustand'
import { persist } from 'zustand/middleware'


interface SellCartState {
  items: SellCartItem[]
  addItem: (item: SellCartItem) => void
  removeOne: (item: SellCartItem) => void
  removeAll: (item: SellCartItem) => void
  clearCart: () => void
  setItems: (items: SellCartItem[]) => void
}

function addWithQuantity(item: SellCartItem) {
  if (item.type === 'product') {
    return {
      type: 'product' as const,
      data: { ...(item.data as Product), quantity: 1 },
    }
  } else {
    return {
      type: 'scrap' as const,
      data: { ...(item.data as Scrap), quantity: 1 },
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

export const sellCartStore = create<SellCartState>()(
  persist(
    (set, get) => ({
      items: [],

      addItem: (item) => {
        let items = [...get().items]
        const match = (a: SellCartItem, b: SellCartItem) => {
          if (a.type !== b.type) return false
          if (a.type === 'product') return a.data.product_name === (b.data as Product).product_name
          if (a.type === 'scrap') return JSON.stringify(a.data) === JSON.stringify(b.data)
          return false
        }
      
        const existing = items.find((i) => match(i, item))
        if (existing) {
          existing.data.quantity = (existing.data.quantity || 1) + 1
        } else {
          items.push(addWithQuantity(item))
        }
      
        set({ items: normalizeScrapNames(items) })
      },

      removeOne: (item) => {
        let items = [...get().items]
        const index = items.findIndex((i) => {
          if (i.type !== item.type) return false
          if (i.type === 'product')
            return i.data.product_name === (item.data as Product).product_name
          if (i.type === 'scrap') return JSON.stringify(i.data) === JSON.stringify(item.data)
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
          set({ items: normalizeScrapNames(items) })
        }
      },

      removeAll: (item) => {
        const filtered = get().items.filter((i) => {
          if (i.type !== item.type) return true
          if (i.type === 'product')
            return i.data.product_name !== (item.data as Product).product_name
          if (i.type === 'scrap') return JSON.stringify(i.data) !== JSON.stringify(item.data)
          return true
        })
        set({ items: normalizeScrapNames(filtered) })
      },

      clearCart: () => set({ items: [] }),

      setItems: (items: SellCartItem[]) => set({ items }),
    }),
    {
      name: 'dorado_sell_cart',
      partialize: (state) => ({ items: state.items }),
    }
  )
)
