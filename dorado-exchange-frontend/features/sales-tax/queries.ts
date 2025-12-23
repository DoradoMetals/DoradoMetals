
import { useApiQuery } from '@/shared/queries/base'
import { queryKeys } from '@/shared/queries/keyFactory'
import type { SalesTaxInput } from '@/types/tax'

export const useSalesTax = (input: SalesTaxInput) => {
  return useApiQuery<number>({
    key: queryKeys.salesTax(input),
    method: 'POST',
    url: '/tax/get_sales_tax',
    enabled: (user) => !!user?.id,
    body: () => ({
      address: input.address,
      items: input.items,
      spots: input.spots,
    }),
  })
}
