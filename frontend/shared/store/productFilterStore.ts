import { create } from 'zustand'
import type { ProductFilters } from '@/shared/types/products'

// WHICH FILTER THE CUSTOMER HAS SELECTED, and nothing else. The filtered list
// itself comes from GET /products - this store's fields are that endpoint's
// query params.
type ProductFilterState = ProductFilters & {
  setFilters: (filters: ProductFilters) => void
  clearFilters: () => void
}

const NONE: ProductFilters = {
  metal: undefined,
  category: undefined,
  type: undefined,
  search: undefined,
  sort: undefined,
}

export const useProductFilterStore = create<ProductFilterState>((set) => ({
  ...NONE,
  setFilters: (filters) => set({ ...NONE, ...filters }),
  clearFilters: () => set(NONE),
}))
