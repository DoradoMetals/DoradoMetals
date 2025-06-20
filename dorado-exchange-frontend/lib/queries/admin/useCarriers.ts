import { useQuery } from '@tanstack/react-query'
import { apiRequest } from '@/utils/axiosInstance'
import { useGetSession } from '../useAuth'
import { Carrier } from '@/types/carriers'

export const useGetAllCarriers = () => {
  const { user } = useGetSession()
  return useQuery<Carrier[]>({
    queryKey: ['admin_carriers'],
    queryFn: async () => {
      return await apiRequest<Carrier[]>('GET', '/carriers/get_all', undefined, {
        user_id: user?.id,
      })
    },
    staleTime: 0,
    enabled: !!user,
  })
}
