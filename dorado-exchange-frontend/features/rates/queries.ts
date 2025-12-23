import { useApiMutation, useApiQuery } from '@/shared/queries/base'
import { queryKeys } from '@/shared/queries/keyFactory'
import type { Rate } from '@/types/rates'


export const useRate = (rate_id: string) => {
  return useApiQuery<Rate[]>({
    key: queryKeys.rate(rate_id),
    url: '/rates/get_one',
    params: () => ({ rate_id }),
    enabled: !!rate_id,
  })
}

export const useRates = () => {
  return useApiQuery<Rate[]>({
    key: queryKeys.rates(),
    url: '/rates/get_all',
    requireUser: false,
  })
}

export const useAdminRates = () => {
  return useApiQuery<Rate[]>({
    key: queryKeys.adminRates(),
    url: '/rates/get_admin',
    requireAdmin: true,
    params: (user) => ({ user_id: user?.id }),
  })
}

export const useCreateRate = () => {
  return useApiMutation<Rate, Rate, Rate[]>({
    queryKey: queryKeys.adminRates(),
    url: '/rates/create',
    requireAdmin: true,
    listAction: 'create',
    listInsertPosition: 'start',
    body: (rate) => ({ rate }),
  })
}

export const useUpdateRate = () => {
  return useApiMutation<Rate, { rate: Rate; user_name: string }, Rate[]>({
    queryKey: queryKeys.adminRates(),
    url: '/rates/update',
    requireAdmin: true,
    listAction: 'upsert',
    optimisticItemKey: 'rate',
    body: ({ rate, user_name }) => ({
      user_name,
      rate,
    }),
  })
}

export const useDeleteRate = () => {
  return useApiMutation<void, Rate, Rate[]>({
    queryKey: queryKeys.adminRates(),
    method: 'DELETE',
    url: '/rates/delete',
    requireAdmin: true,
    listAction: 'delete',
    body: (rate) => ({ rate_id: rate.id }),
  })
}
