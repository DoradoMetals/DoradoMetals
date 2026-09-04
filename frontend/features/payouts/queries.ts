import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { apiRequest } from '@/shared/queries/axios'
import { useGetSession } from '@/features/auth/queries'
import type { Payout, PayoutDetails, PayoutPatch } from "@dorado/contracts";
import { invalidateOrder } from '@dorado/client'

// THE ORDER'S PAYOUT IS AN ORDER READ: useOrderPayouts moved to
// @dorado/client, and OrderView carries the same row under `payout`. What
// stays here is the payout's own write and the admin-only full-detail read.

// The payout as its own resource (D87, per-resource form): the payout row's
// charge and method write here, keyed by order.payout.id off the order wire.
// NEVER the bank details - those have their own admin-only read
// (usePayoutDetails) and no write surface here at all. Admin-only. Settles
// through the one order cache policy: the payout renders inside order reads
// and its cost prices the quote.
// THE REQUEST BODY IS THE CONTRACT'S NOW (phase 3, A3), and it gained a field
// there rather than in two places. `waive_payout_fee` is Jacob's checkbox
// (2026-08-29): waiving does NOT rewrite `cost`, which stays the record of
// what the fee would have been (D117) - it sets a flag the server prices
// against, so the effective fee is 0 and un-waiving restores the stored number
// exactly. Read back off the order wire as `order.totals.waive_payout_fee`.

type PatchPayoutVars = {
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
      invalidateOrder(queryClient, order_id)
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
//
// THE RESPONSE IS THE CONTRACT'S NOW (D214): the payout row plus the two
// sealed values opened onto it (payments.details' AES-256-GCM envelopes),
// not the verbatim exchange.payouts row this used to hand-type. A hand type
// that only named nine of the row's fields kept compiling against either
// shape - it is the contract's PayoutDetails now, so a field this reads that
// the server stops sending is a type error, not a silent undefined.

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
