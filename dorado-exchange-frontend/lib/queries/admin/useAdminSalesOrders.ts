import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useGetSession } from '../useAuth'
import { SalesOrder } from '@/types/sales-orders'
import { apiRequest } from '@/utils/axiosInstance'
import { SpotPrice } from '@/types/metal'

export const useAdminSalesOrders = () => {
  const { user } = useGetSession()

  return useQuery<SalesOrder[]>({
    queryKey: ['admin_sales_orders', user],
    queryFn: async () => {
      if (!user?.id) return []
      return await apiRequest<SalesOrder[]>('GET', '/sales_orders/get_all', undefined, {})
    },
    enabled: !!user,
    refetchInterval: 10000,
  })
}

export const useMoveSalesOrderStatus = () => {
  const { user } = useGetSession()
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({ order_status, order }: { order_status: string; order: SalesOrder }) => {
      if (!user?.id || user?.role !== 'admin') throw new Error('User is not an admin.')
      await apiRequest('POST', '/sales_orders/update_status', {
        order_status,
        order,
        user_name: user?.name,
      })
    },
    onSettled: () => {
      queryClient.invalidateQueries({
        queryKey: ['admin_sales_orders', user],
        refetchType: 'active',
      })
    },
  })
}

export const useSendOrderToSupplier = () => {
  const { user } = useGetSession()
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({
      order,
      spots,
      supplier_id,
    }: {
      order: SalesOrder
      spots: SpotPrice[]
      supplier_id: string
    }) => {
      if (!user?.id || user?.role !== 'admin') throw new Error('User is not an admin.')
      console.log(supplier_id)
      await apiRequest('POST', '/sales_orders/send_order_to_supplier', {
        order,
        spots,
        supplier_id,
      })
    },
    onMutate: async ({ order: sales_order, supplier_id: supplier_id }) => {
      const queryKey = ['admin_sales_orders', user]
      await queryClient.cancelQueries({ queryKey })

      const previousOrders = queryClient.getQueryData<SalesOrder[]>(queryKey)

      queryClient.setQueryData<SalesOrder[]>(queryKey, (old = []) =>
        old.map((order) =>
          order.id !== sales_order.id
            ? order
            : {
                ...order,
                order_sent: true,
                supplier_id: supplier_id,
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
        queryKey: ['admin_sales_orders', user],
        refetchType: 'active',
      })
    },
  })
}

export const useUpdateTracking = () => {
  const { user } = useGetSession()
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({
      order_id,
      shipment_id,
      tracking_number,
      carrier_id,
    }: {
      order_id: string
      shipment_id: string,
      tracking_number: string
      carrier_id: string
    }) => {
      if (!user?.id || user?.role !== 'admin') throw new Error('User is not an admin.')
      await apiRequest('POST', '/sales_orders/update_tracking', {
        order_id,
        shipment_id,
        tracking_number,
        carrier_id,
      })
    },
    onMutate: async ({ order_id, tracking_number, carrier_id }) => {
      const queryKey = ['admin_sales_orders', user]
      await queryClient.cancelQueries({ queryKey })

      const previousOrders = queryClient.getQueryData<SalesOrder[]>(queryKey)

      queryClient.setQueryData<SalesOrder[]>(queryKey, (old = []) =>
        old.map((order) =>
          order.id !== order_id
            ? order
            : {
                ...order,
                shipment: {
                  ...order.shipment,
                  tracking_number,
                  carrier_id,
                },
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
        queryKey: ['admin_sales_orders', user],
        refetchType: 'active',
      })
    },
  })
}
