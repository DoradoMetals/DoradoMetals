import { useQuery } from '@tanstack/react-query'
import { apiRequest } from '@/shared/queries/axios'
import { useGetSession } from '@/features/auth/queries'
import type { OrderFulfillment } from '@dorado/contracts'

// How an order is handed over, as its own read: GET /orders/:orderId/fulfillments
// - LIVE since the read-flip wave, typed by the OrderFulfillment contract both
// sides intake: THE BARE fulfillments.fulfillments row, verbatim, nothing
// else (Jacob, final form - no method embed, no resolved children, "so our
// types don't spiral out of control"). method_id maps to a label off the
// cached GET /fulfillments/methods list; the shipment / pickup / direct
// reads are wave 3's own parent-path endpoints, landed when the drawers
// consume them. The PATH lives under /orders (reads resolve from the parent
// path); the CODE lives here because fulfillments owns the table.
// Admin-only server-side.
//
// NO CONSUMERS YET, deliberately: display still reads the order's embedded
// shipment/payout slots until the wire-slimming and drawer conversion (next
// series), and this hook is that work's target - it re-points reads instead
// of inventing them.
export type { OrderFulfillment } from '@dorado/contracts'

export const useFulfillment = (order_id: string) => {
  const { user } = useGetSession()

  return useQuery<OrderFulfillment>({
    queryKey: ['order_fulfillment', order_id],
    queryFn: async () =>
      await apiRequest<OrderFulfillment>('GET', `/orders/${order_id}/fulfillments`),
    enabled: !!user && !!order_id,
  })
}
