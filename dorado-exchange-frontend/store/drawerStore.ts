import { create } from 'zustand'

type DrawerType = 'cart' | 'sidebar' | 'purchaseOrder' | null

interface DrawerState {
  activeDrawer: DrawerType
  openDrawer: (type: DrawerType) => void
  closeDrawer: () => void
}

export const useDrawerStore = create<DrawerState>((set) => ({
  activeDrawer: null,
  openDrawer: (type) => set({ activeDrawer: type }),
  closeDrawer: () => set({ activeDrawer: null }),
}))