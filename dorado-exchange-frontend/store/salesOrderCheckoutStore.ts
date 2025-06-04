import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { SalesOrderCheckout } from '@/types/sales-orders'

type PartialCheckout = Partial<SalesOrderCheckout>

interface SalesOrderCheckoutState {
  data: PartialCheckout
  setData: (values: PartialCheckout) => void
  updateField: <K extends keyof SalesOrderCheckout>(
    key: K,
    value: SalesOrderCheckout[K]
  ) => void
  clear: () => void
}

export const useSalesOrderCheckoutStore = create<SalesOrderCheckoutState>()(
  persist(
    (set) => ({
      data: {},
      setData: (values) => set((state) => ({ data: { ...state.data, ...values } })),
      updateField: (key, value) =>
        set((state) => ({
          data: {
            ...state.data,
            [key]: value,
          },
        })),
      clear: () => set({ data: {} }),
    }),
    {
      name: 'sales-order-checkout',
    }
  )
)
