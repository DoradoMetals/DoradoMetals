import { SpotPrice } from '@/types/metal'
import { useApiQuery } from '../base'
import { queryKeys } from '../keyFactory'

export const useSpotPrices = () => {
  return useApiQuery<SpotPrice[]>({
    key: queryKeys.spotPrices(),
    url: '/spots/spot_prices',
    requireUser: false,
    refetchInterval: 10000,
  })
}
