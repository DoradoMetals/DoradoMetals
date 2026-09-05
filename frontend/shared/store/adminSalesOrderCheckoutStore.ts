import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { AdminSaleCheckoutForm, DEFAULT_SALES_SERVICE } from '@/features/orders/salesOrders/types'

type PartialAdminCheckout = Partial<AdminSaleCheckoutForm>

interface AdminSalesOrderCheckoutState {
  data: PartialAdminCheckout
  setData: (values: PartialAdminCheckout) => void
  updateField: <K extends keyof AdminSaleCheckoutForm>(
    key: K,
    value: AdminSaleCheckoutForm[K]
  ) => void
  clear: () => void
}


// Same persisted-address note as purchaseOrderCheckoutStore: a deployed
// customer's localStorage predates the address split, so the picked address
// is one flat row. Version 1 splits it into the postal `data.address` and
// the `data.user_address` sibling.
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

export const useAdminSalesOrderCheckoutStore = create<AdminSalesOrderCheckoutState>()(
  persist(
    (set) => ({
      data: {
        service: DEFAULT_SALES_SERVICE,
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
            service: DEFAULT_SALES_SERVICE,
            payment_method: 'CARD',
          },
        }),
    }),
    {
      name: 'admin-sales-order-checkout',
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
