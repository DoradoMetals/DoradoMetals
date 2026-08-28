import { useMutation, useQueryClient } from '@tanstack/react-query'
import { apiRequest } from '@/shared/queries/axios'
import { useGetSession } from '@/features/auth/queries'
import {
  invalidateOrderReads,
  optimisticallyUpdatePurchaseOrder,
  optimisticallyUpdateSalesOrder,
  rollbackOrderLists,
} from '@/features/orders/invalidation'
import type {
  PurchaseOrder,
  PurchaseOrderReturnShipment,
} from '@/features/orders/purchaseOrders/types'
import type { SalesOrder } from '@/features/orders/salesOrders/types'
import type { OrderAddressSnapshot } from '@dorado/contracts'

// ONE ENDPOINT PER RESOURCE, ONE ROUTE VOCABULARY (D87, unified form):
// PATCH /orders/:id holds the ORDER ROW and order-level actions for BOTH
// directions - /purchase_orders and /sales_orders are legacy route
// vocabulary and the mutations no longer speak it (reads move in the
// read-pivot wave). The server validates each op against the order's
// direction: cancel, finalize_pricing and add_funds belong to a purchase
// order, supplier to a sale, and an op sent at the wrong direction is
// refused by name. Admin-only.
//
// STATUS IS A PURE LABEL. The pipelines are explicit ops: finalize_pricing
// (the pricing pipeline, spots resolved server-side), cancel (buys the FedEx
// return label), supplier (the send pipeline with its guard stack).

// The return shipment as the wire speaks it: the checkout's picked pair
// (book address + relationship) collapses to the immutable SNAPSHOT at the
// mutation edge, recipient_name included. It rides only inside the cancel
// op. No UI sends cancel today; the customer-facing cancel was never wired.
export type ReturnShipmentOnPatch = Omit<
  PurchaseOrderReturnShipment,
  'address' | 'user_address'
> & { address: OrderAddressSnapshot }

export type OrderPatch = {
  // A pure label - every status write is only the word. Advancing the label
  // after an op means sending it alongside.
  status?: string
  finalize_pricing?: true
  cancel?: { return_shipment: ReturnShipmentOnPatch }
  add_funds?: boolean
  supplier?: {
    supplier_id: string
    send: true
  }
}

export type PatchOrderVars = {
  id: string
  patch: OrderPatch
}

// D83's rule: only NON-price flips are optimistic. The maps run per list
// family, and the patched order's id matches in exactly one of them - so the
// purchase map never touches a sale and vice versa.
const applyPurchaseFields = (order: PurchaseOrder, patch: OrderPatch): PurchaseOrder => {
  let next = order
  if (patch.cancel) {
    next = { ...next, status: 'Cancelled', spots_locked: false }
  }
  if (patch.status) {
    next = { ...next, status: patch.status }
  }
  return next
}

const applySalesFields = (order: SalesOrder, patch: OrderPatch): SalesOrder => {
  let next = order
  if (patch.supplier?.send) {
    next = { ...next, order_sent: true, supplier_id: patch.supplier.supplier_id }
  }
  if (patch.status) {
    next = { ...next, status: patch.status }
  }
  return next
}

export const usePatchOrder = () => {
  const { user } = useGetSession()
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({ id, patch }: PatchOrderVars) => {
      if (!user?.id) throw new Error('User is not authenticated')
      return await apiRequest<unknown>('PATCH', `/orders/${id}`, patch)
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
