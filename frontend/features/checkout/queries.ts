import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { apiRequest } from '@/shared/queries/axios'
import { useApiQuery } from '@/shared/queries/base'
import { useGetSession } from '@/features/auth/queries'
import type { CarrierRateQuote, OrderView, checkout } from '@dorado/contracts'

// THE CHECKOUT ROW FLOW (D208, Jacob: "each time an option is changed, the
// server-side row gets updated"): the stepper PATCHes the row THE MOMENT a
// choice is made - address on address selection, package_id on package
// selection, carrier_service_id on service selection, the handoff and the
// pickup schedule as they're picked - not batched at "Go to Payment". Order
// creation consumes what the server already holds; the body of the create
// carries ONLY what cannot live server-side - the payout bank form and the
// insurance declaration. RULING 58: the parcel's weight is not one of those
// any more - the server owns it.
const CHECKOUT_ROW_KEY = ['checkout', 'purchase'] as const

// The row itself, read back so a step can tell the server has caught up -
// this is what gates GET /checkout/rates (address + package must already be
// on the row before the carrier can be asked to quote it).
export const usePurchaseCheckoutRow = () =>
  useApiQuery<checkout.CheckoutsRow>({
    key: CHECKOUT_ROW_KEY,
    url: '/checkout',
    params: () => ({ direction: 'purchase' }),
    requireUser: true,
  })

// ONE PATCH PER CHOICE. Every call answers the composed row (same shape GET
// answers), so the cache entry `usePurchaseCheckoutRow` reads is updated in
// place rather than refetched - the rates query keys off it, so a change
// here is what makes rates re-run.
export const usePatchPurchaseCheckout = () => {
  const { user } = useGetSession()
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (
      patch: Partial<
        Pick<
          checkout.CheckoutsRow,
          'shipper_address_id' | 'package_id' | 'carrier_service_id' | 'pickup_date' | 'pickup_time'
        >
      >
    ) => {
      if (!user?.id) throw new Error('User is not authenticated')
      return await apiRequest<checkout.CheckoutsRow>('PATCH', '/checkout', {
        direction: 'purchase',
        ...patch,
      })
    },
    onSuccess: (row) => queryClient.setQueryData(CHECKOUT_ROW_KEY, row),
  })
}

// The draft fulfillment's own write (D208) - a separate endpoint, same
// immediate-on-choice rule. It answers the same composed row a PATCH does.
export const useSetPurchaseHandoff = () => {
  const { user } = useGetSession()
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (handoff_code: string) => {
      if (!user?.id) throw new Error('User is not authenticated')
      return await apiRequest<checkout.CheckoutsRow>('POST', '/checkout/fulfillment', {
        direction: 'purchase',
        handoff_code,
      })
    },
    onSuccess: (row) => queryClient.setQueryData(CHECKOUT_ROW_KEY, row),
  })
}

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

// GET /api/checkout/rates?direction= replaced POST /shipping/get_rates - the
// address, the package and the weight are read off the caller's own checkout
// row and items server-side now, so the browser sends only its direction.
// The answer is the carrier's raw quote per service, `CarrierRateQuote`
// (packages/contracts/src/wire/shipping.ts) - not every field is joined to
// a shipping.services row (no id, no display order), which is why the
// service catalogue (useCarrierServiceOptions) is still read alongside it and
// joined by `serviceType`/`code`, same as the deleted client-side assembly did.
//
// GATED ON THE ROW, NOT THE LOCAL STORE: the server 400s "choose a package
// before requesting rates" until `checkout.shipper_address_id` and
// `checkout.package_id` are actually set, which only a landed PATCH does -
// so this takes the caller's OWN row (usePurchaseCheckoutRow) and keys /
// enables off it. Sending a stale local pick the row hasn't caught up to
// would fetch rates for the wrong parcel or 400.
export type { CarrierRateQuote } from '@dorado/contracts'

export const useCheckoutRates = (
  direction: 'purchase' | 'sale',
  ready: { address_id?: string | null; package_id?: string | null }
) =>
  useApiQuery<CarrierRateQuote[]>({
    key: ['checkout', 'rates', direction, ready.address_id, ready.package_id] as const,
    url: '/checkout/rates',
    params: () => ({ direction }),
    requireUser: true,
    enabled: !!ready.address_id && !!ready.package_id,
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
