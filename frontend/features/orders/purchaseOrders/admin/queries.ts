import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { apiRequest } from '@/shared/queries/axios'
import { PurchaseOrder } from '@/features/orders/purchaseOrders/types'
import type { SpotOnOrder } from '@dorado/contracts'
import { useGetSession } from '@/features/auth/queries'

// The admin mutation surface is per-resource under /orders now (D87 final
// form) - the order row via features/orders/patch.ts, items/spots/shipment/
// payout/refiners each in their owning feature, all settling through
// features/orders/invalidation.ts. What stays here is the reads, the
// cancelled-orders purge - a bulk DELETE across orders, not a write to one.
// The payout-details read lives with its resource in features/payouts.

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

export const usePurgeCancelled = () => {
  const { user } = useGetSession()
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async () => {
      if (!user?.id) throw new Error('User is not authenticated')
      return await apiRequest<PurchaseOrder>('DELETE', '/purchase_orders/purge_cancelled', {})
    },

    onSettled: () => {
      queryClient.invalidateQueries({
        queryKey: ['admin_purchase_orders', user],
        refetchType: 'active',
      })
    },
  })
}

// STILL THE LEGACY ROUTE: the API deferred the refiner-spots read (the
// flip-together rule); this moves with the read-deletion wave.
export const usePurchaseOrderRefinerMetals = (purchase_order_id: string) => {
  const { user } = useGetSession()

  return useQuery<SpotOnOrder[]>({
    queryKey: ['purchase_order_refiner_metals', purchase_order_id],
    queryFn: async () => {
      if (!user?.id) return []
      return await apiRequest<SpotOnOrder[]>(
        'POST',
        '/purchase_orders/get_purchase_order_refiner_metals',
        {
          user_id: user.id,
          purchase_order_id: purchase_order_id,
        }
      )
    },
    enabled: !!user && !!purchase_order_id,
    refetchInterval: 60000,
  })
}
