import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { PurchaseOrderCheckout } from '@/types/purchase-order'

type PartialCheckout = Partial<PurchaseOrderCheckout>

interface PurchaseOrderCheckoutState {
  data: PartialCheckout
  setData: (values: PartialCheckout) => void
  updateField: <K extends keyof PurchaseOrderCheckout>(
    key: K,
    value: PurchaseOrderCheckout[K]
  ) => void
  clear: () => void
}

export const usePurchaseOrderCheckoutStore = create<PurchaseOrderCheckoutState>()(
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
      name: 'purchase-order-checkout',
    }
  )
)
