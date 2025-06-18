import { useQuery } from '@tanstack/react-query'
import { useGetSession } from './useAuth'
import { apiRequest } from '@/utils/axiosInstance'
import { Address } from '@/types/address'
import { Product } from '@/types/product'
import { SpotPrice } from '@/types/metal'

export const useSalesTax = ({
  address,
  items,
  spots,
}: {
  address: Address
  items: Product[]
  spots: SpotPrice[]
}) => {
  const { user } = useGetSession()

  return useQuery<number>({
    queryKey: ['sales_tax', user, address, items, spots],
    queryFn: async () => {
      if (!user?.id) return 0
      return await apiRequest<number>('POST', '/tax/get_sales_tax', {
        address: address,
        items: items,
        spots: spots,
      })
    },
    enabled: !!user,
  })
}
