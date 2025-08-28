import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { Product } from '@/types/product'

interface CartState {
  items: Product[]
  addItem: (product: Product) => void
  removeOne: (product: Product) => void
  removeAll: (product: Product) => void
  clearCart: () => void
  setItems: (items: Product[]) => void
  mergeCartItems: (backendItems: Product[]) => void
}

const mergeCart = (cart: Product[]): Product[] => {
  const merged = new Map<string, Product>()
  for (const item of cart) {
    const key = item.product_name
    if (merged.has(key)) {
      merged.get(key)!.quantity = (merged.get(key)!.quantity || 1) + (item.quantity || 1)
    } else {
      merged.set(key, { ...item, quantity: item.quantity || 1 })
    }
  }
  return Array.from(merged.values())
}

export const cartStore = create<CartState>()(
  persist(
    (set, get) => ({
      items: [],

      addItem: (product: Product) => {
        const items = [...get().items]
        const existing = items.find((i) => i.product_name === product.product_name)

        if (existing) {
          existing.quantity = (existing.quantity || 1) + 1
        } else {
          items.push({ ...product, quantity: 1 })
        }

        set({ items: mergeCart(items) })
      },

      removeOne: (product: Product) => {
        let items = [...get().items]
        const index = items.findIndex((i) => i.product_name === product.product_name)

        if (index !== -1) {
          const item = items[index]
          if ((item.quantity || 1) > 1) {
            items[index] = { ...item, quantity: (item.quantity || 1) - 1 }
          } else {
            items.splice(index, 1)
          }
          set({ items })
        }
      },

      removeAll: (product: Product) => {
        const filtered = get().items.filter((i) => i.product_name !== product.product_name)
        set({ items: filtered })
      },

      clearCart: () => {
        set({ items: [] })
      },

      setItems: (items: Product[]) => {
        set({ items: mergeCart(items) })
      },

      mergeCartItems: (backendItems: Product[]) => {
        const localItems = get().items
        const merged = new Map<string, Product>()

        if (backendItems.length > 0) {
          for (const item of backendItems) {
            const key = item.product_name
            merged.set(key, { ...item, quantity: item.quantity || 1 })
          }
        }

        if (localItems.length > 0) {
          for (const item of localItems) {
            const key = item.product_name
            if (!merged.has(key)) {
              merged.set(key, { ...item, quantity: item.quantity || 1 })
            }
          }
        }

        set({ items: Array.from(merged.values()) })
      },
    }),
    {
      name: 'dorado_cart',
      partialize: (state) => ({ items: state.items }),
    }
  )
)
