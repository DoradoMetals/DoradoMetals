'use client'

import { Address } from '@/types/address'
import { useApiMutation, useApiQuery } from '../base'
import { queryKeys } from '../keyFactory'

export const useAddress = () =>
  useApiQuery<Address[]>({
    key: queryKeys.address(),
    url: '/addresses/get_addresses',
    requireUser: true,
    params: (user) => ({
      user_id: user!.id,
    }),
  })

export const useUserAddress = (userId: string) =>
  useApiQuery<Address[]>({
    key: queryKeys.userAddresses(userId),
    url: '/addresses/get_addresses',
    requireAdmin: true,
    enabled: !!userId,
    params: () => ({
      user_id: userId,
    }),
  })

export const useUpdateAddress = () =>
  useApiMutation<Address, Address, Address[]>({
    queryKey: queryKeys.address(),
    url: '/addresses/create_and_update_address',
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
    url: '/addresses/delete_address',
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
    url: '/addresses/set_default_address',
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
