// store/cartTabStore.ts
import { create } from 'zustand'

type CartTab = 'buy' | 'sell'

interface CartTabStore {
  tab: CartTab
  setTab: (tab: CartTab) => void
}

export const useCartTabStore = create<CartTabStore>((set) => ({
  tab: 'buy',
  setTab: (tab) => set({ tab }),
}))
