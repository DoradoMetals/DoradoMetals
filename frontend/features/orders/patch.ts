import { useMutation, useQueryClient } from '@tanstack/react-query'
import { apiRequest } from '@/shared/queries/axios'
import { useGetSession } from '@/features/auth/queries'
import {
  invalidateOrderReads,
  optimisticallyUpdatePurchaseOrder,
  optimisticallyUpdateSalesOrder,
  rollbackOrderLists,
} from '@/features/orders/invalidation'
import type { orders } from "@dorado/contracts";
import type { PurchaseOrder } from '@/features/orders/purchaseOrders/types'
import type { SalesOrder } from '@/features/orders/salesOrders/types'

// THE ORDER ROW'S OWN MUTATION SURFACE (D214 item 11).
//
// PATCH /orders/:id carries ONLY the row's own columns now - `status` and
// `notes`. The four operations that used to ride inside that body as flags
// (`add_funds`, `finalize_pricing`, `cancel`, `supplier`) are their own
// `POST /orders/:id/<action>` routes below: each is a real action - it moves
// money, buys a FedEx label, or sends a refiner a message - and NONE of them
// writes `status` any more (status is a pure label, never a side effect).
// A caller that wants both the action AND the status change makes two calls.
//
// Every one of the five here answers the whole orders.orders.View now, not the row -
// but nothing in this file reads that response: the cache policy stays
// optimistic-flip-then-invalidate (D83), so the response is a POST result no
// caller destructures.
export type OrderPatch = orders.orders.Patch;

type PatchOrderVars = {
  id: string
  patch: orders.orders.Patch
}

// D83's rule: only NON-price flips are optimistic. The maps run per list
// family, and the patched order's id matches in exactly one of them - so the
// purchase map never touches a sale and vice versa.
const applyPurchaseFields = (order: PurchaseOrder, patch: orders.orders.Patch): PurchaseOrder =>
  patch.status ? { ...order, status: patch.status } : order

const applySalesFields = (order: SalesOrder, patch: orders.orders.Patch): SalesOrder =>
  patch.status ? { ...order, status: patch.status } : order

export const usePatchOrder = () => {
  const { user } = useGetSession()
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({ id, patch }: PatchOrderVars) => {
      if (!user?.id) throw new Error('User is not authenticated')
      return await apiRequest<orders.orders.View>('PATCH', `/orders/${id}`, patch)
    },

    onMutate: async ({ id, patch }) => ({
      previous: [
        ...(await optimisticallyUpdatePurchaseOrder(queryClient, user, id, (order) =>
          applyPurchaseFields(order, patch)
        )),
        ...(await optimisticallyUpdateSalesOrder(queryClient, id, (order) =>
          applySalesFields(order, patch)
        )),
      ],
    }),

    onError: (_err, _vars, context) => {
      rollbackOrderLists(queryClient, context?.previous)
    },

    onSettled: (_data, _err, { id }) => {
      invalidateOrderReads(queryClient, id)
    },
  })
}

// ---------------------------------------------------------------- THE ACTIONS
//
// Each was a flag in the PATCH body until D214 item 11; each is a real
// operation now, its own POST, admin-only like every order mutation. None
// flips `status` optimistically - the caller that wants the label to move
// sends a separate usePatchOrder call once the action settles.

export const useAddFundsToOrder = () => {
  const { user } = useGetSession()
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({ id }: { id: string }) => {
      if (!user?.id) throw new Error('User is not authenticated')
      return await apiRequest<orders.orders.View>('POST', `/orders/${id}/add_funds`)
    },
    onSettled: (_data, _err, { id }) => {
      invalidateOrderReads(queryClient, id)
    },
  })
}

export const useFinalizeOrderPricing = () => {
  const { user } = useGetSession()
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({ id }: { id: string }) => {
      if (!user?.id) throw new Error('User is not authenticated')
      return await apiRequest<orders.orders.View>('POST', `/orders/${id}/finalize_pricing`)
    },
    onSettled: (_data, _err, { id }) => {
      invalidateOrderReads(queryClient, id)
    },
  })
}

type CancelOrderVars = { id: string } & orders.orders.CancelBody

// No UI sends this today (the admin drawer's return-shipment form was never
// built - the only "Cancel Order" button in the tree just PATCHes `status`).
// Kept so the day that form exists, the ids-based body (carrier_service_id,
// package_id, declared_value, weight) is already here rather than the old
// composed `{ address, service, pickup, package, insurance }` document.
export const useCancelOrder = () => {
  const { user } = useGetSession()
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({ id, ...body }: CancelOrderVars) => {
      if (!user?.id) throw new Error('User is not authenticated')
      return await apiRequest<orders.orders.View>('POST', `/orders/${id}/cancel`, body)
    },
    onSettled: (_data, _err, { id }) => {
      invalidateOrderReads(queryClient, id)
    },
  })
}

export const useSendOrderToRefiner = () => {
  const { user } = useGetSession()
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({ id, refiner_id }: { id: string; refiner_id: string }) => {
      if (!user?.id) throw new Error('User is not authenticated')
      return await apiRequest<orders.orders.View>('POST', `/orders/${id}/send_to_refiner`, { refiner_id })
    },
    onSettled: (_data, _err, { id }) => {
      invalidateOrderReads(queryClient, id)
    },
  })
}
