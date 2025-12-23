import { SpotPrice } from '@/features/spots/types'
import { useApiQuery } from '@/shared/queries/base'
import { queryKeys } from '@/shared/queries/keyFactory'


export const useSpotPrices = () => {
  return useApiQuery<SpotPrice[]>({
    key: queryKeys.spotPrices(),
    url: '/spots/spot_prices',
    requireUser: false,
    refetchInterval: 10000,
  })
}
