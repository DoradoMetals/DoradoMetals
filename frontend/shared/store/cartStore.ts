import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { Product } from '@/features/products/types'

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
    const key = item.name
    if (merged.has(key)) {
      merged.get(key)!.quantity = (merged.get(key)!.quantity || 1) + (item.quantity || 1)
    } else {
      merged.set(key, { ...item, quantity: item.quantity || 1 })
    }
  }
  return Array.from(merged.values())
}


// A persisted cart predates the products rename: customers' localStorage
// still holds product_name / product_description / product_type keys, and a
// store keyed by `name` would treat every one of those lines as broken.
// Version 1 renames them in place; the data itself is untouched.
const renameLegacyProduct = (p: Record<string, unknown>): Record<string, unknown> => {
  if (!p || typeof p !== 'object' || !('product_name' in p)) return p
  const { product_name, product_description, product_type, ...rest } = p
  return { ...rest, name: product_name, description: product_description, type: product_type }
}

export const cartStore = create<CartState>()(
  persist(
    (set, get) => ({
      items: [],

      addItem: (product: Product) => {
        const items = [...get().items]
        const existing = items.find((i) => i.name === product.name)

        if (existing) {
          existing.quantity = (existing.quantity || 1) + 1
        } else {
          items.push({ ...product, quantity: 1 })
        }

        set({ items: mergeCart(items) })
      },

      removeOne: (product: Product) => {
        let items = [...get().items]
        const index = items.findIndex((i) => i.name === product.name)

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
        const filtered = get().items.filter((i) => i.name !== product.name)
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
            const key = item.name
            merged.set(key, { ...item, quantity: item.quantity || 1 })
          }
        }

        if (localItems.length > 0) {
          for (const item of localItems) {
            const key = item.name
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
      version: 1,
      migrate: (persisted: unknown) => {
        const state = persisted as { items?: Record<string, unknown>[] }
        return { ...state, items: (state?.items ?? []).map(renameLegacyProduct) } as never
      },
      partialize: (state) => ({ items: state.items }),
    }
  )
)
