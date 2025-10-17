import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { apiRequest } from '@/utils/axiosInstance'
import { useGetSession } from './useAuth'
import { AdminSalesOrderCheckout, SalesOrder, SalesOrderCheckout } from '@/types/sales-orders'
import { SpotPrice } from '@/types/metal'
import { User } from '@/types/user'

export const useSalesOrders = () => {
  const { user } = useGetSession()

  return useQuery<SalesOrder[]>({
    queryKey: ['sales_orders', user?.id],
    queryFn: async () => {
      if (!user?.id) return []
      return await apiRequest<SalesOrder[]>('GET', '/sales_orders/get_sales_orders', undefined, {
        user_id: user.id,
      })
    },
    enabled: !!user,
    refetchInterval: 10000,
  })
}

export const useCreateSalesOrder = () => {
  const { user } = useGetSession()
  const queryClient = useQueryClient()

  return useMutation({
    mutationKey: ['createSalesOrder'],
    mutationFn: async ({
      paymentIntentId,
      sales_order,
      spotPrices,
    }: {
      paymentIntentId?: string
      sales_order: SalesOrderCheckout
      spotPrices: SpotPrice[]
    }) => {
      if (!user?.id) throw new Error('User is not authenticated')
      return await apiRequest<SalesOrder>('POST', '/sales_orders/create_sales_order', {
        sales_order: sales_order,
        payment_intent_id: paymentIntentId,
        spot_prices: spotPrices,
        user: user,
      })
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ['sales_orders', user?.id], refetchType: 'active' })
    },
  })
}

export const useSalesOrderMetals = (sales_order_id: string) => {
  const { user } = useGetSession()

  return useQuery<SpotPrice[]>({
    queryKey: ['sales_orders_metals', user?.id, sales_order_id],
    queryFn: async () => {
      if (!user?.id) return []
      return await apiRequest<SpotPrice[]>('POST', '/sales_orders/get_order_metals', {
        user_id: user.id,
        sales_order_id: sales_order_id,
      })
    },
    enabled: !!user && !!sales_order_id,
    refetchInterval: 60000,
  })
}

export const useSetReviewCreated = () => {
  const { user } = useGetSession()
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({ sales_order }: { sales_order: SalesOrder }) => {
      if (!user?.id) throw new Error('User is not authenticated')
      return await apiRequest<SalesOrder>('POST', '/sales_orders/create_review', {
        user_id: user.id,
        order: sales_order,
      })
    },

    onMutate: async ({ sales_order }) => {
      const queryKey = ['sales_orders', user?.id]
      await queryClient.cancelQueries({ queryKey })

      const previousOrders = queryClient.getQueryData<SalesOrder[]>(queryKey)

      queryClient.setQueryData<SalesOrder[]>(queryKey, (old = []) =>
        old.map((order) =>
          order.id !== sales_order.id
            ? order
            : {
                ...order,
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