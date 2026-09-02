import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { apiRequest } from '@/shared/queries/axios'
import { useApiQuery } from '@/shared/queries/base'
import { useGetSession } from '@/features/auth/queries'
import type { PurchaseOrder } from '@/features/orders/purchaseOrders/types'

// THE CHECKOUT ROW FLOW (D208): the stepper writes IDS onto the server's
// checkout row as the customer decides, the fulfillment is a live draft the
// same call mutates, and order creation consumes what the server holds. The
// body of the create carries ONLY what cannot live server-side - the payout
// bank form, the parcel's weight, the pickup schedule, the insurance
// declaration.

// The boxes a checkout offers - shipping.packages rows (112), replacing the
// hardcoded packageOptions record. Icons stay client-side beside the selector.
export type OfferedPackage = {
  id: string
  label: string
  length: number | null
  width: number | null
  height: number | null
  is_carrier_packaging: boolean
  min_weight_lb: number | null
}

export const useOfferedPackages = () =>
  useApiQuery<OfferedPackage[]>({
    key: ['shipping', 'packages'] as const,
    url: '/shipping/packages',
    requireUser: true,
    staleTime: 60 * 60 * 1000,
  })

// One synchronisation when the customer leaves the shipping step: the row
// takes the ids, the draft fulfillment takes the handoff. Idempotent - going
// back and forward simply re-writes the same choices.
export type PurchaseCheckoutSync = {
  shipper_address_id: string
  package_id: string
  carrier_service_id: string
  handoff_code: string
}

export const useSyncPurchaseCheckout = () => {
  const { user } = useGetSession()
  return useMutation({
    mutationFn: async (sync: PurchaseCheckoutSync) => {
      if (!user?.id) throw new Error('User is not authenticated')
      await apiRequest('PATCH', '/checkout', {
        direction: 'purchase',
        shipper_address_id: sync.shipper_address_id,
        package_id: sync.package_id,
        carrier_service_id: sync.carrier_service_id,
      })
      return await apiRequest('POST', '/checkout/fulfillment', {
        direction: 'purchase',
        handoff_code: sync.handoff_code,
      })
    },
  })
}

export type CreateFromCheckoutBody = {
  payout: Record<string, unknown>
  package_weight: { units: 'LB'; value: number }
  pickup_schedule?: { date?: string; time?: string }
  declared_value?: number
}

export const useCreatePurchaseOrderFromCheckout = () => {
  const { user } = useGetSession()
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (body: CreateFromCheckoutBody) => {
      if (!user?.id) throw new Error('User is not authenticated')
      return await apiRequest<PurchaseOrder>(
        'POST', '/purchase_orders/create_from_checkout', body
      )
    },
    onSettled: () => {
      queryClient.invalidateQueries({
        queryKey: ['purchase_orders', user?.id],
        refetchType: 'active',
      })
    },
  })
}
