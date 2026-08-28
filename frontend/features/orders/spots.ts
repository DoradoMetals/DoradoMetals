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

// The order's metals as their own resource: PUT /orders/:id/spots (D87,
// unified form - /purchase_orders is legacy route vocabulary). lock: true pins at the LIVE prices the SERVER
// resolves - the browser's copy of the feed never goes down; lock: false
// unpins and clears the rows; set writes named bids onto the frozen rows.
export type OrderSpotWrite = {
  name: string
  bid: number
}

export type SetOrderSpotsVars = {
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
