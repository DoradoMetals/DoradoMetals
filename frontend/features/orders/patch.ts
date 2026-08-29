import { useMutation, useQueryClient } from '@tanstack/react-query'
import { apiRequest } from '@/shared/queries/axios'
import { useGetSession } from '@/features/auth/queries'
import {
  invalidateOrderReads,
  optimisticallyUpdatePurchaseOrder,
  optimisticallyUpdateSalesOrder,
  rollbackOrderLists,
} from '@/features/orders/invalidation'
import type { OrderPatch } from '@dorado/contracts'
import type {
  PurchaseOrder,
  PurchaseOrderReturnShipment,
} from '@/features/orders/purchaseOrders/types'
import type { SalesOrder } from '@/features/orders/salesOrders/types'
import type { OrderAddressInput } from '@/features/orders/addressSnapshot'

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

// THE REQUEST BODY IS THE CONTRACT'S NOW (phase 3, A3). The remainder this
// file declared has been taken: `OrderPatch` was written here AND in
// api/features/orders/patch.service.ts, and the two had drifted - the API's
// said `finalize_pricing?: boolean` and `supplier.send: boolean` while its own
// refusedField had always refused anything but `true`. One definition, pinned
// to what the endpoint actually accepts, in @dorado/contracts/wire/patches.ts.
//
// The mutation VARIABLE bundles beside it (`Patch*Vars`) are a different
// thing and are not exported: an id plus a patch plus whatever the cache
// needs is react-query plumbing, used in one file, and never crosses the wire
// as a unit.
export type { OrderPatch } from '@dorado/contracts'

// The return shipment as the wire speaks it: the checkout's picked pair
// (book address + relationship) collapses to the immutable SNAPSHOT at the
// mutation edge, recipient_name included. It rides only inside the cancel op.
//
// A LOCAL NARROWING, DELIBERATELY NOT IN THE CONTRACT. The wire admits any
// object here because the API does: patchOrder hands `cancel.return_shipment`
// straight to the cancel pipeline without reading a field of it, and the
// shape below is assembled from this app's own package / pickup / service /
// insurance FORM schemas, which are UI policy and not table-derived. Naming it
// in the contracts would drag four form schemas into a package the API
// imports. No UI sends cancel today; the customer-facing cancel was never
// wired, and this is the record of what to build when one is.
export type ReturnShipmentOnPatch = Omit<
  PurchaseOrderReturnShipment,
  'address' | 'user_address'
> & { address: OrderAddressInput }

type PatchOrderVars = {
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
    // WHICH REFINERY HAS THE METAL IS THE ENGAGEMENT'S (refiners.orders,
    // ruling 6) and never was a column of the order row - the composed wire
    // carried supplier_id as an alias of it. Only the order's own flag flips
    // optimistically here; the engagement refetches through
    // invalidateOrderReads, which invalidates refiner_order by id.
    next = { ...next, order_sent: true }
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
