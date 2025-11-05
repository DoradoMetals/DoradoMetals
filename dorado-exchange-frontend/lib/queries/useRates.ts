import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { apiRequest } from '@/utils/axiosInstance'
import { Rate } from '@/types/rates'
import { useGetSession } from './useAuth'

export const useRate = (rate_id: string) => {
  return useQuery<Rate[]>({
    queryKey: ['rate', rate_id],
    queryFn: async () => {
      return await apiRequest<Rate[]>('GET', '/rates/get_one', undefined, {
        rate_id: rate_id,
      })
    },
    enabled: !!rate_id,
  })
}

export const useRates = () => {
  return useQuery<Rate[]>({
    queryKey: ['rates'],
    queryFn: async () => {
      console.log('here')
      return await apiRequest<Rate[]>(
        'GET',
        '/rates/get_all',
        undefined,
        {}
      )
    },
    staleTime: 100000,
  })
}

export const useAdminRates = () => {
  const { user } = useGetSession()
  return useQuery<Rate[]>({
    queryKey: ['adminRates'],
    queryFn: async () => {
      return await apiRequest<Rate[]>('GET', '/rates/get_admin', undefined, {
        user_id: user?.id,
      })
    },
    staleTime: 10000,
    enabled: !!user,
  })
}

export const useCreateRate = () => {
  const { user } = useGetSession()
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (rate: Rate) => {
      if (!user?.id) throw new Error('User is not authenticated')
      return await apiRequest<Rate>('POST', '/rates/create', {
        rate,
      })
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ['adminRates'], refetchType: 'active' })
    },
  })
}

export const useUpdateRate = () => {
  const { user } = useGetSession()
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({ rate, user_name }: { rate: Rate; user_name: string }) => {
      if (!user?.id) throw new Error('User is not authenticated')
      return await apiRequest<Rate>('POST', '/rates/update', {
        user_name,
        rate,
      })
    },
    onMutate: async (updated) => {
      await queryClient.cancelQueries({ queryKey: ['adminRates'] })

      const previous = queryClient.getQueryData<Rate[]>(['adminRates'])

      queryClient.setQueryData<Rate[]>(['adminRates'], (old = []) =>
        old.map((rate) => (rate.id === updated?.rate.id ? { ...rate, ...updated.rate } : rate))
      )

      return { previous }
    },
    onError: (_err, _newProduct, context) => {
      if (context?.previous) {
        queryClient.setQueryData(['adminRates'], context.previous)
      }
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ['adminRates'], refetchType: 'active' })
    },
  })
}

export const useDeleteRate = () => {
  const { user } = useGetSession()
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (rate: Rate) => {
      if (!user?.id) throw new Error('User is not authenticated')
      return await apiRequest('DELETE', '/rates/delete', {
        rate_id: rate.id,
      })
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ['adminRates'], refetchType: 'active' })
    },
  })
}


