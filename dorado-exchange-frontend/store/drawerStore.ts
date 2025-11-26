import { create } from 'zustand'
import { User } from '@/types/user'

type DrawerType =
  | 'cart'
  | 'sidebar'
  | 'purchaseOrder'
  | 'salesOrder'
  | 'address'
  | 'users'
  | 'createSalesOrder'
  | 'leads'
  | 'product'
  | 'reviews'
  | 'adminSidebar'
  | 'accountSidebar'
  | null

interface DrawerState {
  activeDrawer: DrawerType
  openDrawer: (type: DrawerType) => void
  closeDrawer: () => void

  createSalesOrderUser: User | null
  setCreateSalesOrderUser: (user: User | null) => void
}

export const useDrawerStore = create<DrawerState>((set) => ({
  activeDrawer: null,
  openDrawer: (type) => set({ activeDrawer: type }),
  closeDrawer: () => set({ activeDrawer: null }),

  createSalesOrderUser: null,
  setCreateSalesOrderUser: (user) => set({ createSalesOrderUser: user }),
}))
