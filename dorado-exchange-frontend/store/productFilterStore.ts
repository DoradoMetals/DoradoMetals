import { create } from 'zustand'
import type { ProductFilters } from '@/types/product'

type ProductFilterState = ProductFilters & {
  setFilters: (filters: Partial<ProductFilters>) => void
  clearFilters: () => void
}

export const useProductFilterStore = create<ProductFilterState>((set) => ({
  metal_type: undefined,
  filter_category: undefined,
  product_type: undefined,

  setFilters: (filters) =>
    set((state) => ({
      ...state,
      ...filters,
    })),

  clearFilters: () =>
    set({
      metal_type: undefined,
      filter_category: undefined,
      product_type: undefined,
    }),
}))
