import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { apiRequest } from '@/utils/axiosInstance'
import { useGetSession } from './useAuth'
import { SalesOrder, SalesOrderCheckout } from '@/types/sales-orders'
import { SpotPrice } from '@/types/metal'

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
      queryClient.invalidateQueries({ queryKey: ['sales_orders', user], refetchType: 'active' })
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
