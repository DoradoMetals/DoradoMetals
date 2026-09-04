import { useQuery } from '@tanstack/react-query'
import { apiRequest } from '@/shared/queries/axios'
import { useGetSession } from '@/features/auth/queries'
import type { Fulfillment, FulfillmentDirect, FulfillmentPickup } from "@dorado/contracts";

// How an order is handed over, as its own read: GET /orders/:orderId/fulfillments
// - LIVE since the read-flip wave, typed by the Fulfillment contract both
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
export type OrderFulfillment = Fulfillment;

export const useFulfillment = (order_id: string) => {
  const { user } = useGetSession()

  return useQuery<Fulfillment>({
    queryKey: ['order_fulfillment', order_id],
    queryFn: async () =>
      await apiRequest<Fulfillment>('GET', `/orders/${order_id}/fulfillments`),
    enabled: !!user && !!order_id,
  })
}

// THE FULFILLMENT'S CHILDREN, each its own parent-path read (wave 3).
// US COLLECTING FROM A CUSTOMER (a pickup) and A CUSTOMER COMING TO US (a
// direct). Neither is a carrier booking - useShipmentPickups is FedEx coming
// for a parcel, hangs off the shipment, and lives in features/shipping. Both
// answer [] rather than 404 when the order is handed over some other way, so
// a drawer renders the same component for every method.

export const useOrderPickups = (order_id: string) => {
  const { user } = useGetSession()

  return useQuery<FulfillmentPickup[]>({
    queryKey: ['order_pickups', order_id],
    queryFn: async () =>
      await apiRequest<FulfillmentPickup[]>('GET', `/orders/${order_id}/pickups`),
    enabled: !!user && !!order_id,
  })
}

export const useOrderDirects = (order_id: string) => {
  const { user } = useGetSession()

  return useQuery<FulfillmentDirect[]>({
    queryKey: ['order_directs', order_id],
    queryFn: async () =>
      await apiRequest<FulfillmentDirect[]>('GET', `/orders/${order_id}/directs`),
    enabled: !!user && !!order_id,
  })
}
