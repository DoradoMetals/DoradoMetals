import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { apiRequest } from '@/shared/queries/axios'
import { useGetSession } from '@/features/auth/queries'
import { invalidateOrderReads } from '@/features/orders/invalidation'
import { PayoutDetails } from '@/features/payouts/types'

// The payout as its own resource (D87, per-resource form): the payout row's
// charge and method write here, keyed by order.payout.id off the order wire.
// NEVER the bank details - those have their own admin-only read
// (usePayoutDetails) and no write surface here at all. Admin-only. Settles
// through the one order cache policy: the payout renders inside order reads
// and its cost prices the quote.
export type PayoutPatch = {
  cost?: number
  method?: string
}

export type PatchPayoutVars = {
  payout_id: string
  // For the caches; the URL does not carry it.
  order_id: string
  patch: PayoutPatch
}

export const usePatchPayout = () => {
  const { user } = useGetSession()
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({ payout_id, patch }: PatchPayoutVars) => {
      if (!user?.id) throw new Error('User is not authenticated')
      return await apiRequest<unknown>('PATCH', `/payouts/${payout_id}`, patch)
    },
    onSettled: (_data, _err, { order_id }) => {
      invalidateOrderReads(queryClient, order_id)
    },
  })
}

// Full bank details for one payout. RADIOACTIVE, rules unchanged: these are
// deliberately absent from the order payloads (the orders list would
// otherwise carry every customer's routing and account number), fetched on
// demand only where an admin is about to execute a transfer, admin-only
// server-side, and never cached past the render (staleTime 0, gcTime 0).
//
// PAYOUT-KEYED: GET /payouts/:id/details, the payout's own id off the order
// wire (order.payout.id). Admin-only server-side.
export const usePayoutDetails = (payout_id: string | null | undefined, enabled: boolean) => {
  return useQuery<PayoutDetails>({
    queryKey: ['payout_details', payout_id],
    queryFn: async () =>
      await apiRequest<PayoutDetails>('GET', `/payouts/${payout_id}/details`),
    enabled: !!payout_id && enabled,
    staleTime: 0,
    gcTime: 0,
  })
}
