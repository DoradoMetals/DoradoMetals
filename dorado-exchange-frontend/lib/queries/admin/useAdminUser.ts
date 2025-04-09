import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { apiRequest } from '@/utils/axiosInstance'
import { useGetSession } from '../useAuth'
import { AdminUser } from '@/types/admin'

export const useAdminUser = (
  user_id: string,
  options?: { enabled?: boolean }
) => {
  const { user } = useGetSession()
  return useQuery<AdminUser>({
    queryKey: ['adminUser'],
    queryFn: async () => {
      const res = await apiRequest<AdminUser[]>('GET', '/admin/get_user', undefined, { user, user_id });
      return res[0]; // because rows = array
    },
    staleTime: 0,
    enabled: !!user && (options?.enabled ?? true), // 👈 include optional enabled
  })
}