import { useMutation, useQueryClient } from '@tanstack/react-query'
import { apiRequest } from '@/shared/queries/axios'
import { useGetSession } from '@/features/auth/queries'
import {
  invalidateOrderReads,
  optimisticallyUpdatePurchaseOrder,
  rollbackOrderLists,
} from '@/features/orders/invalidation'

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
