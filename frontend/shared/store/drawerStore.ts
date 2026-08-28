import { create } from 'zustand'
import { User } from '@/features/users/types'
import { Address, UserAddress } from '@/features/addresses/types'

type DrawerName =
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
  | 'carriers'
  | 'carrierServices'
  | null

type DrawerPayloads = {
  address?: Address | null
  // The caller's relationship to it - travels beside the address, never
  // inside it, since the split (2026-08-27).
  userAddress?: UserAddress | null
}

interface DrawerState {
  activeDrawer: DrawerName
  payload: DrawerPayloads

  openDrawer: (name: DrawerName, payload?: DrawerPayloads) => void
  closeDrawer: () => void

  createSalesOrderUser: User | null
  setCreateSalesOrderUser: (user: User | null) => void
}

export const useDrawerStore = create<DrawerState>((set) => ({
  activeDrawer: null,
  payload: {},

  openDrawer: (name, payload) =>
    set({
      activeDrawer: name,
      payload: payload ?? {},
    }),

  closeDrawer: () =>
    set({
      activeDrawer: null,
      payload: {},
    }),

  createSalesOrderUser: null,
  setCreateSalesOrderUser: (user) => set({ createSalesOrderUser: user }),
}))
