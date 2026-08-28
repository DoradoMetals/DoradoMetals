import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { PurchaseOrderCheckout } from '@/features/orders/purchaseOrders/types'

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


// A deployed customer's localStorage predates the address split: the picked
// address persisted as one flat row, label under `name`, with `is_default`
// and `user_id` in among the postal fields - which AddressWireNext would
// reject at the checkout parse. Version 1 splits it the way the wire now
// does: `data.address` keeps only the postal row, and the relationship
// becomes the `data.user_address` sibling.
const splitPersistedAddress = (a: Record<string, unknown> | undefined) => {
  if (!a || typeof a !== 'object') return null
  if (!('name' in a) && !('is_default' in a)) return null
  const { name, is_default, user_id, ...address } = a
  return {
    address,
    user_address: {
      address_id: typeof address.id === 'string' ? address.id : '',
      user_id: user_id ?? null,
      label: name ?? null,
      default_shipping: is_default ?? false,
    },
  }
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
      version: 1,
      migrate: (persisted: unknown) => {
        const state = persisted as { data?: Record<string, unknown> }
        const split = splitPersistedAddress(state?.data?.address as Record<string, unknown> | undefined)
        if (split && state.data) {
          state.data.address = split.address as never
          state.data.user_address = split.user_address as never
        }
        return state as never
      },
    }
  )
)
