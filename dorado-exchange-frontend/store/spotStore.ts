import { create } from 'zustand'
import { persist } from 'zustand/middleware'

export type SpotType = 'Ask' | 'Bid'

interface SpotTypeState {
  type: SpotType
  setType: (t: SpotType) => void
  toggleType: () => void
}

export const useSpotTypeStore = create<SpotTypeState>()(
  persist(
    (set) => ({
      type: 'Ask',
      setType: (type) => set({ type }),
      toggleType: () =>
        set((state) => ({ type: state.type === 'Bid' ? 'Ask' : 'Bid' })),
    }),
    {
      name: 'spot-type',
    }
  )
)