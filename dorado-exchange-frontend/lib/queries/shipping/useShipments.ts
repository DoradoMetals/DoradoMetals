import { Shipment } from "@/types/shipments"
import { useGetSession } from "../useAuth"
import { useQuery } from "@tanstack/react-query"
import { apiRequest } from "@/utils/axiosInstance"

export const useShipments = (order_id: string) => {
  const { user } = useGetSession()

  return useQuery<Shipment[]>({
    queryKey: ['shipment', user],
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
