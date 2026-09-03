import { upsertById, useApiMutation, useApiQuery } from '@/shared/queries/base'
import { queryKeys } from '@/shared/queries/keys'
import type { Rate, AdminRate, RatePatch } from '@/features/rates/types'
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
  return useApiMutation<
    AdminRate,
    { rate_id: string; patch: RatePatch; user_name: string },
    AdminRate[]
  >({
    queryKey: queryKeys.adminRates(),
    url: '/rates/update',
    requireAdmin: true,
    optimisticUpdater: (previous, vars) => {
      const current = previous?.find((r) => r.id === vars.rate_id)
      return upsertById(previous, { ...current, ...vars.patch, id: vars.rate_id } as AdminRate)
    },
    body: ({ rate_id, patch, user_name }) => ({
      rate_id,
      patch,
      user_name,
    }),
  })
}

export const useDeleteRate = () => {
  return useApiMutation<boolean, AdminRate, AdminRate[]>({
    queryKey: queryKeys.adminRates(),
    method: 'DELETE',
    url: '/rates/delete',
    requireAdmin: true,
    listAction: 'delete',
    body: (rate) => ({ rate_id: rate.id }),
  })
}
