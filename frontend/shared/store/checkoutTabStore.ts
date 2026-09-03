import { create } from 'zustand'
import type { Direction } from '@dorado/contracts'

interface CheckoutTabState {
  direction: Direction
  setDirection: (direction: Direction) => void
}

export const useCheckoutTab = create<CheckoutTabState>((set) => ({
  direction: 'sale',
  setDirection: (direction) => set({ direction }),
}))
