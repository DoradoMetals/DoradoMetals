import { Shipment } from '@/types/shipments'
import { useGetSession } from '../useAuth'
import { useQuery } from '@tanstack/react-query'
import { apiRequest } from '@/utils/axiosInstance'
import { ShipmentTracking } from '@/types/shipping'

export const useShipments = (order_id: string) => {
  const { user } = useGetSession()

  return useQuery<Shipment[]>({
    queryKey: ['inbound_shipment', user],
    queryFn: async () => {
      if (!user?.id) return []
      return await apiRequest<Shipment[]>('GET', '/shipping/get_inbound_shipment', undefined, {
        user_id: user.id,
        order_id: order_id,
      })
    },
    enabled: !!user,
  })
}

export const useShipmentTracking = (
  shipment_id: string,
  shipment_start: string,
  shipment_end: string,
  tracking_number: string
) => {
  const { user } = useGetSession()

  return useQuery<ShipmentTracking | null>({
    queryKey: ['inbound_shipment_tracking', shipment_id, user],
    queryFn: async () => {
      if (!user?.id) return null
      return await apiRequest<ShipmentTracking>('POST', '/shipping/get_inbound_shipment_tracking', {
        tracking_number,
        shipment_id,
        shipment_end,
        shipment_start,
      })
    },
    enabled: !!user,
  })
}

export const useReturnShipments = (order_id: string) => {
  const { user } = useGetSession()

  return useQuery<Shipment[]>({
    queryKey: ['inbound_shipment', user],
    queryFn: async () => {
      if (!user?.id) return []
      return await apiRequest<Shipment[]>('GET', '/shipping/get_return_shipment', undefined, {
        user_id: user.id,
        order_id: order_id,
      })
    },
    enabled: !!user,
  })
}

export const useReturnShipmentTracking = (
  shipment_id: string,
  shipment_start: string,
  shipment_end: string,
  tracking_number: string
) => {
  const { user } = useGetSession()

  return useQuery<ShipmentTracking | null>({
    queryKey: ['return_shipment_tracking', shipment_id, user],
    queryFn: async () => {
      if (!user?.id) return null
      return await apiRequest<ShipmentTracking>('POST', '/shipping/get_return_shipment_tracking', {
        tracking_number,
        shipment_id,
        shipment_end,
        shipment_start,
      })
    },
    enabled: !!user,
  })
}
