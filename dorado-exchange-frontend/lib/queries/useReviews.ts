import { useMutation, useQueryClient } from '@tanstack/react-query'
import { apiRequest } from '@/utils/axiosInstance'
import { useGetSession } from './useAuth'
import { PurchaseOrder } from '@/types/purchase-order'

export const useCreateReview = () => {
  const { user } = useGetSession()
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({ review, order }: { review: string; order: PurchaseOrder }) => {
      if (!user?.id) throw new Error('User is not authenticated')
      await apiRequest('POST', '/purchase_orders/create_review', {
        user: user,
        order: order,
      })
      return await apiRequest('POST', '/reviews/create_review', {
        user: user,
        review: review,
      })
    },
    onMutate: async ({ review, order }) => {
      const queryKey = ['purchase_orders', user?.id]
      await queryClient.cancelQueries({ queryKey })

      const previousOrders = queryClient.getQueryData<PurchaseOrder[]>(queryKey)

      queryClient.setQueryData<PurchaseOrder[]>(queryKey, (old = []) =>
        old.map((o) =>
          o.id !== order.id
            ? o
            : {
                ...o,
                review_created: true,
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

    onSettled: (_data, _err, _vars, context) => {
      if (context?.queryKey) {
        queryClient.invalidateQueries({ queryKey: context.queryKey, refetchType: 'active' })
      }
    },
  })
}
