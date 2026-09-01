import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { apiRequest } from '@/shared/queries/axios'
import { PurchaseOrder } from '@/features/orders/purchaseOrders/types'
import { useGetSession } from '@/features/auth/queries'

// The admin mutation surface is per-resource under /orders now (D87 final
// form) - the order row via features/orders/patch.ts, items/spots/shipment/
// payout/refiners each in their owning feature, all settling through
// features/orders/invalidation.ts. What stays here is the reads. The
// payout-details read lives with its resource in features/payouts. (The
// cancelled-orders purge lived here too until 2026-09-01 - removed with its
// button; the endpoint behind it deleted only the exchange half.)

export const useAdminPurchaseOrders = () => {
  const { user } = useGetSession()

  return useQuery<PurchaseOrder[]>({
    queryKey: ['admin_purchase_orders', user],
    queryFn: async () => {
      if (!user?.id) return []
      return await apiRequest<PurchaseOrder[]>('GET', '/orders', undefined, {
        direction: 'purchase',
      })
    },
    enabled: !!user,
    refetchInterval: 10000,
  })
}

// The refiner metals read moved home: it is useRefinerMetals in
// features/refiners/queries.ts - the hook follows the RESOURCE (refiners),
// not the legacy route this file used to front.
