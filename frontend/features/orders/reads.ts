import { useQuery } from '@tanstack/react-query'
import { apiRequest } from '@/shared/queries/axios'
import { useGetSession } from '@/features/auth/queries'
import type { Address, OrderItem } from "@dorado/contracts";

// THE ORDER-SCOPED READS THAT ORDERS OWNS (wave 3). One read per table, each
// keyed by the order id a component already holds, each returning the table's
// rows verbatim - which is what makes the container/presentational split
// possible: a section that shows lines calls useOrderItems(orderId) itself and
// hands plain rows to a dumb child, instead of having them drilled down from
// a composed order five levels up.
//
// The rest of the family lives with the feature that owns its table:
// spots in features/orders/spots.ts, shipments in features/shipping,
// payouts in features/payouts, the engagement in features/refiners, the
// fulfillment chain in features/fulfillments.

export type OrderAddress = Address;

// The order's LINES - orders.items rows, scrap and bullion in one table.
// bullion_id is the only product reference (null means scrap) and metal_id
// the only metal reference; names come from the catalogue and the spots
// reference lists the client already caches. Owner-or-admin server-side, so a
// customer's own drawer can call it.
export const useOrderItems = (order_id: string) => {
  const { user } = useGetSession()

  return useQuery<OrderItem[]>({
    queryKey: ['order_items', order_id],
    queryFn: async () => await apiRequest<OrderItem[]>('GET', `/orders/${order_id}/items`),
    enabled: !!user && !!order_id,
  })
}

// The address SNAPSHOT the parcel went to - a places.addresses row, resolved
// from the order through orders.addresses by the server. 404 when the order
// has no address link, which is a real state; `retry: false` so a drawer does
// not sit re-asking for a row that will not appear.
export const useOrderAddress = (order_id: string) => {
  const { user } = useGetSession()

  return useQuery<Address>({
    queryKey: ['order_address', order_id],
    queryFn: async () => await apiRequest<Address>('GET', `/orders/${order_id}/address`),
    enabled: !!user && !!order_id,
    retry: false,
  })
}

// DISPLAY NAMES ARE MAPPED, NOT JOINED (ruling 12, "we shouldn't let UI
// dictate the API"). An orders.items row carries bullion_id and metal_id and
// no names at all; these are the two lookups every drawer does against
// reference lists it already caches - the catalogue (useProducts) and the
// spots list (useSpotPrices), whose `id` IS the metal's id.
//
// Both return null rather than a placeholder when the reference list has not
// arrived, so a caller decides whether that is "loading" or "missing" - see
// the note in assignScrapItemNames.test.ts about what a lookup miss now
// costs.
export const nameOf = <T extends { id: string; name?: string | null }>(
  list: T[],
  id: string | null | undefined
): string | null => (id ? (list.find((r) => r.id === id)?.name ?? null) : null)

export const byId = <T extends { id: string }>(
  list: T[],
  id: string | null | undefined
): T | null => (id ? (list.find((r) => r.id === id) ?? null) : null)
