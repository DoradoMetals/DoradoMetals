// hooks/useSpotPrices.ts
import { useQuery } from '@tanstack/react-query'
import { apiRequest } from '@/utils/axiosInstance'
import { SpotPrice } from '@/types/metal'

export const useSpotPrices = () => {
  return useQuery<SpotPrice[]>({
    queryKey: ['spot_prices'],
    queryFn: async () => {
      return await apiRequest<SpotPrice[]>('GET', '/spots/spot_prices')
    },
    refetchInterval: 10000,
  })
}
