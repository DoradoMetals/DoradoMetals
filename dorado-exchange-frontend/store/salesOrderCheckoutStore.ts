import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { SalesOrderCheckout, salesOrderServiceOptions } from '@/types/sales-orders'
import { makeEmptyAddress } from '@/features/addresses/types'

type PartialCheckout = Partial<SalesOrderCheckout>

interface SalesOrderCheckoutState {
  data: PartialCheckout
  setData: (values: PartialCheckout) => void
  updateField: <K extends keyof SalesOrderCheckout>(key: K, value: SalesOrderCheckout[K]) => void
  clear: () => void
}

export const useSalesOrderCheckoutStore = create<SalesOrderCheckoutState>()(
  persist(
    (set) => ({
      data: {
        address: makeEmptyAddress(),
        service: salesOrderServiceOptions.STANDARD,
        using_funds: true,
        payment_method: 'CARD',
      },
      setData: (values) => set((state) => ({ data: { ...state.data, ...values } })),
      updateField: (key, value) =>
        set((state) => ({
          data: {
            ...state.data,
            [key]: value,
          },
        })),
      clear: () =>
        set({
          data: {
            address: makeEmptyAddress(),
            service: salesOrderServiceOptions.STANDARD,
            using_funds: true,
            payment_method: 'CARD',
          },
        }),
    }),
    {
      name: 'sales-order-checkout',
    }
  )
)
