import { useApiMutation, useApiQuery } from '@/shared/queries/base'
import { queryKeys } from '@/shared/queries/keys'
import type { Rate, AdminRate } from '@/features/rates/types'
import type { RateInput } from '@dorado/contracts'

// TWO READS, TWO SHAPES. /rates/get_all drops the audit columns and
// /rates/get_admin keeps them (api/features/rates/wire.ts). Both were typed
// `Rate[]` here off one hand-written type that carried the union; the write
// endpoints answer with the admin shape and take `RateInput`, which is the
// six writable columns and nothing else.


export const useRates = () => {
  return useApiQuery<Rate[]>({
    key: queryKeys.rates(),
    url: '/rates/get_all',
    requireUser: false,
  })
}

export const useAdminRates = () => {
  return useApiQuery<AdminRate[]>({
    key: queryKeys.adminRates(),
    url: '/rates/get_admin',
    requireAdmin: true,
    params: (user) => ({ user_id: user?.id }),
  })
}

export const useCreateRate = () => {
  return useApiMutation<AdminRate, RateInput, AdminRate[]>({
    queryKey: queryKeys.adminRates(),
    url: '/rates/create',
    requireAdmin: true,
    listAction: 'create',
    listInsertPosition: 'start',
    body: (rate) => ({ rate }),
  })
}

export const useUpdateRate = () => {
  return useApiMutation<AdminRate, { rate: AdminRate; user_name: string }, AdminRate[]>({
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
  return useApiMutation<void, AdminRate, AdminRate[]>({
    queryKey: queryKeys.adminRates(),
    method: 'DELETE',
    url: '/rates/delete',
    requireAdmin: true,
    listAction: 'delete',
    body: (rate) => ({ rate_id: rate.id }),
  })
}
