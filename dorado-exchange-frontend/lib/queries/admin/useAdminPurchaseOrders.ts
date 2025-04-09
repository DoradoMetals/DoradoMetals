import { useQuery } from '@tanstack/react-query'
import { apiRequest } from '@/utils/axiosInstance'
import { useGetSession } from '../useAuth'
import { AdminPurchaseOrder } from '@/types/admin'

export const useAdminPurchaseOrders = () => {
  const { user } = useGetSession()
  return useQuery<AdminPurchaseOrder[]>({
    queryKey: ['adminScrap'],
    queryFn: async () => {
      return await apiRequest<AdminPurchaseOrder[]>('GET', '/admin/get_purchase_orders', undefined, {user_id: user?.id})
    },
    staleTime: 0,
    enabled: !!user,
  })
}
