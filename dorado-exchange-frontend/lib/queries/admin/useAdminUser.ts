import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { apiRequest } from '@/utils/axiosInstance'
import { useGetSession } from '../useAuth'
import { AdminUser } from '@/types/admin'

export const useAdminUser = (user_id: string, options?: { enabled?: boolean }) => {
  const { user } = useGetSession()
  return useQuery<AdminUser>({
    queryKey: ['adminUser', user?.id],
    queryFn: async () => {
      const res = await apiRequest<AdminUser[]>('GET', '/users/get_user', undefined, {
        user,
        user_id,
      })
      return res[0]
    },
    staleTime: 0,
    enabled: !!user && (options?.enabled ?? true),
  })
}

export const useAdminUsers = () => {
  const { user } = useGetSession()

  return useQuery<AdminUser[]>({
    queryKey: ['adminAllUsers', user?.id],
    queryFn: async () => {
      return await apiRequest<AdminUser[]>('GET', '/users/get_all_users', undefined, { user })
    },
    staleTime: 0,
    enabled: !!user,
  })
}

export const useUpdateCredit= () => {
  const { user } = useGetSession()
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({
      user_id,
      mode,
      amount,
    }: {
      user_id: string
      mode: string
      amount: number
    }) => {
      if (!user?.id || user?.role !== 'admin') throw new Error('User is not an admin.')
      await apiRequest('POST', '/users/update_credit', {
        user_id,
        mode,
        amount,
      })
    },
    onMutate: async ({ user_id, mode, amount }) => {
      const queryKey = ['adminAllUsers', user?.id]
      await queryClient.cancelQueries({ queryKey })

      const previousOrders = queryClient.getQueryData<AdminUser[]>(queryKey)

      queryClient.setQueryData<AdminUser[]>(queryKey, (old = []) =>
        old.map((curr) =>
          curr.id !== user_id
            ? curr
            : {
                ...curr,
                dorado_funds: amount,
              }
        )
      )

      return { previousOrders, queryKey }
    },

    onError: (_err, _vars, context) => {
      if (context?.previousOrders && context.queryKey) {
        queryClient.setQueryData(context.queryKey, context.previousOrders)
      }
    },

    onSettled: () => {
      queryClient.invalidateQueries({
        queryKey: ['adminAllUsers', user?.id],
        refetchType: 'active',
      })
    },
  })
}
