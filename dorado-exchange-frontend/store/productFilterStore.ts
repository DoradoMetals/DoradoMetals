import { create } from 'zustand'

type ProductFilters = {
  metal_type?: string
  mint_type?: string
  product_type?: string
  setFilters: (filters: Partial<ProductFilters>) => void
  clearFilters: () => void
}

export const useProductFilterStore = create<ProductFilters>((set) => ({
  metal_type: undefined,
  mint_type: undefined,
  product_type: undefined,
  setFilters: (filters) => set((state) => ({ ...state, ...filters })),
  clearFilters: () => set({ metal_type: undefined, mint_type: undefined, product_type: undefined }),
}))
