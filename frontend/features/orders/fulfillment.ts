import { useQuery } from '@tanstack/react-query'
import { apiRequest } from '@/shared/queries/axios'
import { useGetSession } from '@/features/auth/queries'
import type { FulfillmentMethod, FulfillmentPickup, ShipmentOnOrder } from '@dorado/contracts'

// How an order is handed over, as its own read: GET /orders/:id/fulfillment.
// Each value is the BARE resource from the contracts - the method row, the
// shipment(s), the pickup booking - not the order's embedded slots.
//
// NO CONSUMERS THIS SERIES, deliberately - and DORMANT: the API route lands
// next series with the read-deletion wave (display still reads the order's
// embedded shipment/payout slots until then). The wire-slimming and drawer
// conversion is that wave's work, and this hook is its target - it exists
// now so that work re-points reads instead of inventing them.
//
// The shipment values are ShipmentOnOrder because that is the only shipment
// shape the wire has ever had - the contracts define no standalone shipment
// schema on purpose (the raw row carries a bytea label).
export type OrderFulfillment = {
  method: FulfillmentMethod
  shipment?: ShipmentOnOrder
  return_shipment?: ShipmentOnOrder
  pickup?: FulfillmentPickup
}

export const useOrderFulfillment = (order_id: string) => {
  const { user } = useGetSession()

  return useQuery<OrderFulfillment>({
    queryKey: ['order_fulfillment', order_id],
    queryFn: async () =>
      await apiRequest<OrderFulfillment>('GET', `/orders/${order_id}/fulfillment`),
    enabled: !!user && !!order_id,
  })
}
