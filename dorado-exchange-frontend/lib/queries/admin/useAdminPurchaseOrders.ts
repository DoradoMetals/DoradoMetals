import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { apiRequest } from '@/utils/axiosInstance'
import { useGetSession } from '../useAuth'
import { ShipmentTracking } from '@/types/shipping'
import { PurchaseOrder } from '@/types/purchase-order'

export const useAdminPurchaseOrders = () => {
  const { user } = useGetSession()

  return useQuery<PurchaseOrder[]>({
    queryKey: ['admin_purchase_orders', user],
    queryFn: async () => {
      if (!user?.id) return []
      return await apiRequest<PurchaseOrder[]>('GET', '/admin/get_admin_purchase_orders', undefined, {
        user_id: user.id,
      })
    },
    enabled: !!user,
  })
}

export const useMovePurchaseOrderStatus = () => {
  const { user } = useGetSession()
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({
      order_status,
      order_id,
    }: { order_status: string; order_id: string }) => {
      if (!user?.id || user?.role !== 'admin') throw new Error('User is not an admin.')

      await apiRequest('POST', '/admin/change_purchase_order_status', {
        order_status,
        order_id,
        user_name: user?.name,
      })
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ['admin_purchase_orders', user], refetchType: 'active' })
    },
  })
}

export const useAdminInTransit = (
  shipment_id: string,
  shipment_start: string,
  shipment_end: string,
  tracking_number: string
) => {
  const { user } = useGetSession()

  return useQuery<ShipmentTracking | null>({
    queryKey: ['admin_inbound_shipment_tracking', shipment_id, user],
    queryFn: async () => {
      if (!user?.id || user?.role !== 'admin') return null
      return await apiRequest<ShipmentTracking>(
        'POST',
        '/shipping/get_inbound_shipment_tracking',
        {
          tracking_number,
          shipment_id,
          shipment_end,
          shipment_start,
        }
      )
    },
    enabled: !!user,
  })
}
