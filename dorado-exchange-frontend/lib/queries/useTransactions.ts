import { useQuery } from '@tanstack/react-query'
import { apiRequest } from '@/utils/axiosInstance'
import { useGetSession } from './useAuth'

import { Transaction } from '@/types/transaction'

export const useTransactions = () => {
  const { user } = useGetSession()

  return useQuery<Transaction[]>({
    queryKey: ['transactions', user?.id],
    queryFn: async () => {
      if (!user?.id) return []
      return await apiRequest<Transaction[]>('GET', '/transactions/get_transactions', undefined, {
        user_id: user.id,
      })
    },
    enabled: !!user,
    refetchInterval: 10000,
  })
}
