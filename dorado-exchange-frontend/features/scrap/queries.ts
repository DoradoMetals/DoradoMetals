import { SpotPrice } from '@/features/spots/types'
import { useApiMutation } from '@/shared/queries/base'
import { queryKeys } from '@/shared/queries/keys'

export const useEditScrapPercentages = () =>
  useApiMutation<void, SpotPrice, SpotPrice[]>({
    method: 'POST',
    url: '/spots/update_scrap_percentage',
    requireAdmin: true,
    queryKey: queryKeys.spotPrices(),
    body: (spot, user) => ({
      user_id: user?.id,
      id: spot.id,
      scrap_percentage: spot.scrap_percentage,
    }),
  })
