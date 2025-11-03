import { useQuery } from '@tanstack/react-query'
import { apiRequest } from '@/utils/axiosInstance'
import { Rate } from '@/types/rates'

export const useRates = () => {
  return useQuery<Rate[]>({
    queryKey: ['rates'],
    queryFn: async () => {
      console.log('here')
      return await apiRequest<Rate[]>(
        'GET',
        '/rates/get_rates',
        undefined,
        {}
      )
    },
    staleTime: 100000,
  })
}
