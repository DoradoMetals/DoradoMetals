import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { apiRequest } from '@/shared/queries/axios'
import { useGetSession } from '@/features/auth/queries'
import type { OrderSpot } from '@dorado/contracts'
import type { SpotPrice } from '@/features/spots/types'
import {
  invalidateOrderReads,
  optimisticallyUpdatePurchaseOrder,
  rollbackOrderLists,
} from '@/features/orders/invalidation'

// The order's quoted spots as the BARE resource: GET /orders/:id/spots - one
// endpoint, one hook, BOTH directions, because orders.spots is one table and
// the shape is its VERBATIM generated row (the OrderSpot contract, ruling
// 12). Replaces usePurchaseOrderMetals and useSalesOrderMetals, which were
// named for the legacy routes they called; the hook follows the resource now.
export const useOrderSpots = (order_id: string) => {
  const { user } = useGetSession()

  return useQuery<OrderSpot[]>({
    queryKey: ['order_spots', order_id],
    queryFn: async () => await apiRequest<OrderSpot[]>('GET', `/orders/${order_id}/spots`),
    enabled: !!user && !!order_id,
    refetchInterval: 60_000,
  })
}

// DISPLAY COMPOSITION, client-side (Jacob: the UI does not dictate the API;
// the frontend maps display names from a cached reference read). The spot
// row carries metal_id; the spots reference read's `id` IS the metal's id.
// Not money math - the quotes endpoints remain the only price source.
export type NamedOrderSpot<T extends { metal_id: string } = OrderSpot> = T & {
  name: string | null
}

export const nameSpots = <T extends { metal_id: string }>(
  spots: T[],
  metals: Pick<SpotPrice, 'id' | 'name'>[]
): (T & { name: string | null })[] =>
  spots.map((s) => ({ ...s, name: metals.find((m) => m.id === s.metal_id)?.name ?? null }))

// THE `*Patch` SHAPES BELOW ARE REQUEST BODIES, AND THEY STAY EXPORTED ON
// PURPOSE (phase 3, ruling 39 + ruling 37).
//
// Each is DATA - it describes what crosses the network - so its home is
// @dorado/contracts, imported by the API to parse and by this file to
// construct. It is not moved in this wave because an input contract is only
// worth having if it is pinned to what the endpoint ACTUALLY accepts, and
// this wave found the cost of the alternative: `CreateReviewBody` and
// `CreateLeadBody` had both been sitting in the contracts, adopted by
// NOBODY, and both were wrong - the review one omitted `hidden`, which is
// the entire difference between a published review and a hidden one. Adding
// unvalidated input contracts at scale would multiply that.
//
// Pinning these means reading the API's own service and SQL for each, and
// api/features is another lane's this session. Listed in
// docs/waves/phase3-frontend.md as the wave's declared remainder.
//
// The mutation VARIABLE bundles beside them (`Patch*Vars`) are a different
// thing and stopped being exported: an id plus a patch plus whatever the
// cache needs is react-query plumbing, used in one file, and never crosses
// the wire as a unit.

// The order's metals as their own resource: PUT /orders/:id/spots (D87,
// unified form - /purchase_orders is legacy route vocabulary). lock: true pins at the LIVE prices the SERVER
// resolves - the browser's copy of the feed never goes down; lock: false
// unpins and clears the rows; set writes named bids onto the frozen rows.
export type OrderSpotWrite = {
  name: string
  bid: number
}

type SetOrderSpotsVars = {
  order_id: string
  lock?: boolean
  set?: OrderSpotWrite[]
}

export const useSetOrderSpots = () => {
  const { user } = useGetSession()
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({ order_id, lock, set }: SetOrderSpotsVars) => {
      if (!user?.id) throw new Error('User is not authenticated')
      return await apiRequest<unknown>('PUT', `/orders/${order_id}/spots`, {
        ...(lock !== undefined ? { lock } : null),
        ...(set !== undefined ? { set } : null),
      })
    },

    // The spots_locked flag is the one NON-price field here (D83); the pinned
    // prices themselves come back from the refetch.
    onMutate: async ({ order_id, lock }) => ({
      previous:
        lock === undefined
          ? undefined
          : await optimisticallyUpdatePurchaseOrder(queryClient, user, order_id, (order) => ({
              ...order,
              spots_locked: lock,
            })),
    }),

    onError: (_err, _vars, context) => {
      rollbackOrderLists(queryClient, context?.previous)
    },

    onSettled: (_data, _err, { order_id }) => {
      invalidateOrderReads(queryClient, order_id)
    },
  })
}
