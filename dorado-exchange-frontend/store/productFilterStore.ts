import { create } from 'zustand'

type ProductFilters = {
  metal_type?: string
  filter_category?: string
  product_type?: string
  setFilters: (filters: Partial<ProductFilters>) => void
  clearFilters: () => void
}

export const useProductFilterStore = create<ProductFilters>((set) => ({
  metal_type: undefined,
  filter_category: undefined,
  product_type: undefined,
  setFilters: (filters) => set((state) => ({ ...state, ...filters })),
  clearFilters: () => set({ metal_type: undefined, filter_category: undefined, product_type: undefined }),
}))
