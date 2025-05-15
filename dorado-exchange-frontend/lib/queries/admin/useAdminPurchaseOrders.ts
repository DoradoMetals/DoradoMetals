import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { apiRequest } from '@/utils/axiosInstance'
import { useGetSession } from '../useAuth'
import { ShipmentTracking } from '@/types/shipping'
import { PurchaseOrder } from '@/types/purchase-order'
import { SpotPrice } from '@/types/metal'

export const useAdminPurchaseOrders = () => {
  const { user } = useGetSession()

  return useQuery<PurchaseOrder[]>({
    queryKey: ['admin_purchase_orders', user],
    queryFn: async () => {
      if (!user?.id) return []
      return await apiRequest<PurchaseOrder[]>(
        'GET',
        '/admin/get_admin_purchase_orders',
        undefined,
        {
          user_id: user.id,
        }
      )
    },
    enabled: !!user,
  })
}

export const useAdminPurchaseOrderMetals = (purchase_order_id: string) => {
  const { user } = useGetSession()

  return useQuery<SpotPrice[]>({
    queryKey: ['admin_purchase_orders_metals', user?.id, purchase_order_id],
    queryFn: async () => {
      if (!user?.id) return []
      return await apiRequest<SpotPrice[]>('POST', '/admin/get_admin_purchase_order_metals', {
        user_id: user.id,
        purchase_order_id: purchase_order_id,
      })
    },
    enabled: !!user && !!purchase_order_id,
  })
}

export const useMovePurchaseOrderStatus = () => {
  const { user } = useGetSession()
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({ order_status, order_id }: { order_status: string; order_id: string }) => {
      if (!user?.id || user?.role !== 'admin') throw new Error('User is not an admin.')

      await apiRequest('POST', '/admin/change_purchase_order_status', {
        order_status,
        order_id,
        user_name: user?.name,
      })
    },
    onSettled: () => {
      queryClient.invalidateQueries({
        queryKey: ['admin_purchase_orders', user],
        refetchType: 'active',
      })
    },
  })
}

export const useAdminInTransit = (
  shipment_id: string,
  shipment_start: string,
  shipment_end: string,
  tracking_number: string
) => {
  const { user } = useGetSession()

  return useQuery<ShipmentTracking | null>({
    queryKey: ['admin_inbound_shipment_tracking', shipment_id, user],
    queryFn: async () => {
      if (!user?.id || user?.role !== 'admin') return null
      return await apiRequest<ShipmentTracking>('POST', '/shipping/get_inbound_shipment_tracking', {
        tracking_number,
        shipment_id,
        shipment_end,
        shipment_start,
      })
    },
    enabled: !!user,
  })
}

export const useUpdateOrderScrapPercentage = () => {
  const { user } = useGetSession()
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({
      spot,
      scrap_percentage,
    }: {
      spot: SpotPrice
      scrap_percentage: number
    }) => {
      if (!user?.id) throw new Error('User is not authenticated')
      return await apiRequest<SpotPrice>('POST', '/admin/update_purchase_order_scrap_percentage', {
        user_id: user.id,
        spot,
        scrap_percentage,
      })
    },
    onMutate: async ({ spot, scrap_percentage }) => {
      const queryKey = ['admin_purchase_orders_metals', user?.id, spot.purchase_order_id]
      await queryClient.cancelQueries({ queryKey })
      const previousSpotPrices = queryClient.getQueryData<SpotPrice[]>(queryKey)
      queryClient.setQueryData<SpotPrice[]>(queryKey, (old = []) =>
        old.map((s) => (s.id === spot.id ? { ...s, scrap_percentage } : s))
      )

      return { previousSpotPrices, queryKey }
    },
    onError: (_err, _newData, context) => {
      if (context?.previousSpotPrices && context.queryKey) {
        queryClient.setQueryData(context.queryKey, context.previousSpotPrices)
      }
    },
    onSettled: (_data, _err, _vars, context) => {
      if (context?.queryKey) {
        queryClient.invalidateQueries({
          queryKey: context.queryKey,
          refetchType: 'active',
        })
      }
    },
  })
}

export const useResetOrderScrapPercentage = () => {
  const { user } = useGetSession()
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({ spot }: { spot: SpotPrice }) => {
      if (!user?.id) throw new Error('User is not authenticated')

      return await apiRequest<SpotPrice>('POST', '/admin/reset_purchase_order_scrap_percentage', {
        user_id: user.id,
        spot,
      })
    },
    onMutate: async ({ spot }) => {
      const queryKey = ['admin_purchase_orders_metals', user?.id, spot.purchase_order_id]
      console.log('⏳ onMutate called for', spot)

      await queryClient.cancelQueries({ queryKey })

      const previousSpotPrices = queryClient.getQueryData<SpotPrice[]>(queryKey)
      const globalSpotPrices = queryClient.getQueryData<SpotPrice[]>(['spot_prices'])

      console.log('🌎 Global spot prices:', globalSpotPrices)

      const globalScrapPercentage = globalSpotPrices?.find(
        (s) => s.type === spot.type
      )?.scrap_percentage

      console.log(`🔁 Resetting ${spot.type} to`, globalScrapPercentage)

      queryClient.setQueryData<SpotPrice[]>(queryKey, (old = []) =>
        old.map((s) =>
          s.id === spot.id
            ? { ...s, scrap_percentage: globalScrapPercentage ?? s.scrap_percentage }
            : s
        )
      )

      return { previousSpotPrices, queryKey }
    },
    onError: (_err, _vars, context) => {
      if (context?.previousSpotPrices && context.queryKey) {
        queryClient.setQueryData(context.queryKey, context.previousSpotPrices)
      }
    },
    onSettled: (_data, _err, _vars, context) => {
      if (context?.queryKey) {
        queryClient.invalidateQueries({
          queryKey: context.queryKey,
          refetchType: 'active',
        })
      }
    },
  })
}

export const useUpdateOrderSpotPrice = () => {
  const { user } = useGetSession()
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({ spot, updated_spot }: { spot: SpotPrice; updated_spot: number }) => {
      if (!user?.id) throw new Error('User is not authenticated')
      return await apiRequest<SpotPrice>('POST', '/admin/update_purchase_order_spot', {
        user_id: user.id,
        spot,
        updated_spot,
      })
    },
    onMutate: async ({ spot, updated_spot }) => {
      const queryKey = ['admin_purchase_orders_metals', user?.id, spot.purchase_order_id]
      await queryClient.cancelQueries({ queryKey })
      const previousSpotPrices = queryClient.getQueryData<SpotPrice[]>(queryKey)

      queryClient.setQueryData<SpotPrice[]>(queryKey, (old = []) =>
        old.map((s) => (s.id === spot.id ? { ...s, bid_spot: updated_spot } : s))
      )

      return { previousSpotPrices, queryKey }
    },
    onError: (_err, _vars, context) => {
      if (context?.previousSpotPrices && context.queryKey) {
        queryClient.setQueryData(context.queryKey, context.previousSpotPrices)
      }
    },
    onSettled: (_data, _err, _vars, context) => {
      if (context?.queryKey) {
        queryClient.invalidateQueries({
          queryKey: context.queryKey,
          refetchType: 'active',
        })
      }
    },
  })
}

export const useLockOrderSpotPrices = () => {
  const { user } = useGetSession()
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({ spots, purchase_order_id }: { spots: SpotPrice[], purchase_order_id: string }) => {
      if (!user?.id) throw new Error('User is not authenticated')
      return await apiRequest<SpotPrice[]>('POST', '/admin/lock_purchase_order_spots', {
        user_id: user.id,
        spots,
        purchase_order_id: purchase_order_id,
      })
    },
    onMutate: async ({ spots, purchase_order_id }) => {
      const queryKey = ['admin_purchase_orders_metals', user?.id, purchase_order_id]

      await queryClient.cancelQueries({ queryKey })
      const previousSpotPrices = queryClient.getQueryData<SpotPrice[]>(queryKey)

      queryClient.setQueryData<SpotPrice[]>(queryKey, (old = []) =>
        old.map((s) => {
          const incoming = spots.find((sp) => sp.id === s.id)
          return incoming ? { ...s, bid_spot: incoming.bid_spot } : s
        })
      )

      return { previousSpotPrices, queryKey }
    },
    onError: (_err, _vars, context) => {
      if (context?.previousSpotPrices && context.queryKey) {
        queryClient.setQueryData(context.queryKey, context.previousSpotPrices)
      }
    },
    onSettled: (_data, _err, _vars, context) => {
      if (context?.queryKey) {
        queryClient.invalidateQueries({
          queryKey: context.queryKey,
          refetchType: 'active',
        })
      }
    },
  })
}

export const useResetOrderSpotPrices = () => {
  const { user } = useGetSession()
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({ purchase_order_id }: { purchase_order_id: string }) => {
      if (!user?.id) throw new Error('User is not authenticated')
      return await apiRequest<SpotPrice[]>('POST', '/admin/reset_purchase_order_spots', {
        user_id: user.id,
        purchase_order_id,
      })
    },
    onMutate: async ({ purchase_order_id }) => {
      const queryKey = ['admin_purchase_orders_metals', user?.id, purchase_order_id]
      await queryClient.cancelQueries({ queryKey })
      const previousSpotPrices = queryClient.getQueryData<SpotPrice[]>(queryKey)

      queryClient.setQueryData<SpotPrice[]>(queryKey, (old = []) =>
        old.map((s) => ({
          ...s,
          bid_spot: null as unknown as number,
        }))
      )

      return { previousSpotPrices, queryKey }
    },
    onError: (_err, _vars, context) => {
      if (context?.previousSpotPrices && context.queryKey) {
        queryClient.setQueryData(context.queryKey, context.previousSpotPrices)
      }
    },
    onSettled: (_data, _err, _vars, context) => {
      if (context?.queryKey) {
        queryClient.invalidateQueries({
          queryKey: context.queryKey,
          refetchType: 'active',
        })
      }
    },
  })
}
