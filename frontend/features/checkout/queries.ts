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
  package_weight: number
  declared_value: number
  pickup_date: string | null
  pickup_time: string | null
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
        package_weight: sync.package_weight,
        declared_value: sync.declared_value,
        pickup_date: sync.pickup_date,
        pickup_time: sync.pickup_time,
      })
      return await apiRequest('POST', '/checkout/fulfillment', {
        direction: 'purchase',
        handoff_code: sync.handoff_code,
      })
    },
  })
}

// The payout STEP's write (D210): the bank form goes server-side when the
// customer completes the step - numbers sealed at rest - and creation later
// LINKS the row. The response never carries numbers, only last_four.
export const useSaveCheckoutPayout = () => {
  const { user } = useGetSession()
  return useMutation({
    mutationFn: async (form: Record<string, unknown>) => {
      if (!user?.id) throw new Error('User is not authenticated')
      return await apiRequest('POST', '/checkout/payout', {
        direction: 'purchase',
        ...form,
      })
    },
  })
}

// ZERO BODY (D210): by Confirm, every choice is a server-side resource - the
// request is a trigger, nothing more.
export const useCreatePurchaseOrderFromCheckout = () => {
  const { user } = useGetSession()
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async () => {
      if (!user?.id) throw new Error('User is not authenticated')
      return await apiRequest<PurchaseOrder>(
        'POST', '/purchase_orders/create_from_checkout', {}
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
