import { useGetSession } from '../useAuth'
import { useQuery } from '@tanstack/react-query'
import { apiRequest } from '@/utils/axiosInstance'
import { ShipmentTracking } from '@/types/shipping'

export const useTracking = (
  shipment_id: string,
  tracking_number: string,
  carrier_id: string,
) => {
  const { user } = useGetSession()

  return useQuery<ShipmentTracking | null>({
    queryKey: ['shipment_tracking', shipment_id, user],
    queryFn: async () => {
      if (!user?.id) return null
      return await apiRequest<ShipmentTracking>('POST', '/shipping/get_tracking', {
        tracking_number,
        shipment_id,
        carrier_id,
      })
    },
    enabled: !!user,
  })
}