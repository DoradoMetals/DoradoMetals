import { useQuery } from '@tanstack/react-query'
import { apiRequest } from '@/utils/axiosInstance'
import { useGetSession } from '../useAuth'
import { AdminProduct } from '@/types/admin'

export const useAdminProducts = () => {
  const { user } = useGetSession()
  return useQuery<AdminProduct[]>({
    queryKey: ['adminProducts'],
    queryFn: async () => {
      return await apiRequest<AdminProduct[]>('GET', '/admin/get_products', undefined, {user_id: user?.id})
    },
    staleTime: 0,
    enabled: !!user,
  })
}
