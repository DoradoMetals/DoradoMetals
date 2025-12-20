'use client'

import { Address } from '@/features/addresses/types'
import { useApiMutation, useApiQuery } from '@/lib/base'
import { queryKeys } from '@/lib/keyFactory'

export const useAddress = () =>
  useApiQuery<Address[]>({
    key: queryKeys.address(),
    url: '/addresses/get',
    requireUser: true,
    params: (user) => ({
      user_id: user!.id,
    }),
  })

export const useUserAddress = (userId: string) =>
  useApiQuery<Address[]>({
    key: queryKeys.userAddresses(userId),
    url: '/addresses/get',
    requireAdmin: true,
    enabled: !!userId,
    params: () => ({
      user_id: userId,
    }),
  })

  export const useCreateAddress = () =>
  useApiMutation<Address, Address, Address[]>({
    queryKey: queryKeys.address(),
    url: '/addresses/create',
    requireUser: true,
    listAction: 'create',
    listInsertPosition: 'start',
    body: (address, user) => ({
      user_id: user!.id,
      address,
    }),
  })

export const useUpdateAddress = () =>
  useApiMutation<Address, Address, Address[]>({
    queryKey: queryKeys.address(),
    url: '/addresses/update',
    requireUser: true,
    body: (address, user) => ({
      user_id: user!.id,
      address,
    }),
  })

export const useDeleteAddress = () =>
  useApiMutation<void, Address, Address[]>({
    queryKey: queryKeys.address(),
    method: 'DELETE',
    url: '/addresses/delete',
    requireUser: true,
    listAction: 'delete',
    optimisticItemKey: 'id',
    body: (address, user) => ({
      user_id: user!.id,
      address,
    }),
  })

export const useSetDefaultAddress = () =>
  useApiMutation<void, Address, Address[]>({
    queryKey: queryKeys.address(),
    url: '/addresses/set_default',
    requireUser: true,
    body: (address, user) => ({
      user_id: user!.id,
      address,
    }),
    optimisticUpdater: (list, address) => {
      const items = list ?? []

      return items.map((a) => ({
        ...a,
        is_default: a.id === address.id,
      }))
    },
  })
