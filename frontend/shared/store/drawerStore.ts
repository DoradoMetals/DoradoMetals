import { create } from 'zustand'
// THE ADMIN USERS WIRE, not better-auth's session user. `setCreateSalesOrderUser`
// has exactly one caller - features/users/ui/UsersDrawer.tsx's "Create Sales
// Order" button - and it hands over a row from GET /users/get_all. This slot
// was typed as the session user, which is camelCase and a DIFFERENT SHAPE; it
// compiled only because every field of that type is optional, so a snake_case
// object satisfied it vacuously.
import { AdminUser } from '@/features/users/types'
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

  createSalesOrderUser: AdminUser | null
  setCreateSalesOrderUser: (user: AdminUser | null) => void
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
