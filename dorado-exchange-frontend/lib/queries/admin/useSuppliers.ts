import { useQuery } from '@tanstack/react-query'
import { apiRequest } from '@/utils/axiosInstance'
import { useGetSession } from '../useAuth'
import { Supplier } from '@/types/supplier'

export const useGetAllSuppliers = () => {
  const { user } = useGetSession()
  return useQuery<Supplier[]>({
    queryKey: ['admin_suppliers'],
    queryFn: async () => {
      return await apiRequest<Supplier[]>('GET', '/suppliers/get_all', undefined, {
        user_id: user?.id,
      })
    },
    staleTime: 0,
    enabled: !!user,
  })
}
