import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { apiRequest } from '@/shared/queries/axios'
import { useApiQuery } from '@/shared/queries/base'
import { useGetSession } from '@/features/auth/queries'
import type { OrderView } from "@dorado/contracts";

// THE CHECKOUT ROW FLOW (D208): the stepper writes IDS onto the server's
// checkout row as the customer decides, the fulfillment is a live draft the
// same call mutates, and order creation consumes what the server holds. The
// body of the create carries ONLY what cannot live server-side - the payout
// bank form, the pickup schedule, the insurance declaration. RULING 58: the
// parcel's weight is not one of those any more - the server owns it.

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
//
// RULING 58 (Jacob): no package_weight, no declared_value - the browser
// neither computes nor sends either. The server owns the parcel's weight and
// its insured value.
export type PurchaseCheckoutSync = {
  shipper_address_id: string
  package_id: string
  carrier_service_id: string
  handoff_code: string
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

// GET /api/checkout/rates?direction= - the carrier's own priced catalogue for
// THIS checkout, one flat row per offered service (API lane, landing
// separately). The browser assembles no rate request any more: no address,
// no package, no weight composed client-side - it renders what the server
// quotes. Field names are provisional; retype against the real response when
// that lane lands.
export type CheckoutRate = {
  id: string | null
  code: string
  carrier_code: string
  name: string
  display_order: number
  net_charge: number
  currency: string
  delivery_day: string | null
  transit_time: string | null
}

export const useCheckoutRates = (direction: 'purchase' | 'sale', enabled = true) =>
  useApiQuery<CheckoutRate[]>({
    key: ['checkout', 'rates', direction] as const,
    url: '/checkout/rates',
    params: () => ({ direction }),
    requireUser: true,
    enabled,
    staleTime: 5 * 60 * 1000,
    retry: false,
  })

// The payout STEP's write (D210): the bank form goes server-side when the
// customer completes the step - numbers sealed at rest - and creation later
// LINKS the row. The response never carries numbers, only last_four.
//
// CheckoutPayoutBody now parses strict (batch 4): only the seven form
// columns plus direction. `form` is the payoutSchema union, which also
// carries `confirmation` (a client-only checkbox) and `cost` (a display
// figure the server recomputes) - both would 400 as unknown keys, so they
// are picked out rather than forwarded whole.
export const useSaveCheckoutPayout = () => {
  const { user } = useGetSession()
  return useMutation({
    mutationFn: async (form: Record<string, unknown>) => {
      if (!user?.id) throw new Error('User is not authenticated')
      return await apiRequest('POST', '/checkout/payout', {
        direction: 'purchase',
        method: form.method,
        account_holder_name: form.account_holder_name,
        bank_name: form.bank_name,
        account_type: form.account_type,
        routing_number: form.routing_number,
        account_number: form.account_number,
        payout_email: form.payout_email,
      })
    },
  })
}

// ONE ID, RESOLVED HERE (D214 item 11): by Confirm, every choice is already a
// server-side resource, so the only thing Confirm still needs to find is the
// checkout row's OWN id - GET /checkout?direction=purchase answers with the
// caller's row (created on first read if none existed), and the create body
// is that id and nothing else. It replaces the zero-body trigger; the click
// itself carries no new information either way.
export const useCreatePurchaseOrderFromCheckout = () => {
  const { user } = useGetSession()
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async () => {
      if (!user?.id) throw new Error('User is not authenticated')
      const { id: checkout_id } = await apiRequest<{ id: string }>(
        'GET', '/checkout', undefined, { direction: 'purchase' }
      )
      return await apiRequest<OrderView>(
        'POST', '/purchase_orders/create_from_checkout', { checkout_id }
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
