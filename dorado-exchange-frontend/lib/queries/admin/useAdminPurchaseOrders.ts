import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { apiRequest } from '@/utils/axiosInstance'
import { useGetSession } from '../useAuth'
import { PurchaseOrder, PurchaseOrderItem } from '@/types/purchase-order'
import { SpotPrice } from '@/types/metal'
import { Product } from '@/types/product'
import getPurchaseOrderItemPrice from '@/utils/getPurchaseOrderItemPrice'
import getPurchaseOrderTotal from '@/utils/purchaseOrderTotal'

export const useAdminPurchaseOrders = () => {
  const { user } = useGetSession()

  return useQuery<PurchaseOrder[]>({
    queryKey: ['admin_purchase_orders', user],
    queryFn: async () => {
      if (!user?.id) return []
      return await apiRequest<PurchaseOrder[]>(
        'GET',
        '/purchase_orders/get_all_purchase_orders',
        undefined,
        {}
      )
    },
    enabled: !!user,
    refetchInterval: 10000,
  })
}

export const useMovePurchaseOrderStatus = () => {
  const { user } = useGetSession()
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({ order_status, order }: { order_status: string; order: PurchaseOrder }) => {
      if (!user?.id || user?.role !== 'admin') throw new Error('User is not an admin.')
      await apiRequest('POST', '/purchase_orders/update_status', {
        order_status,
        order,
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

export const useSendOffer = () => {
  const { user } = useGetSession()
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({ order_status, order }: { order_status: string; order: PurchaseOrder }) => {
      if (!user?.id || user?.role !== 'admin') throw new Error('User is not an admin.')
      await apiRequest('POST', '/purchase_orders/send_offer', {
        order_status,
        order,
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

export const useUpdateRejectedOffer = () => {
  const { user } = useGetSession()
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({ order_status, order }: { order_status: string; order: PurchaseOrder }) => {
      if (!user?.id) throw new Error('User is not authenticated')
      await apiRequest<PurchaseOrder>('POST', '/purchase_orders/update_rejected_offer', {
        order_status,
        order,
        user_name: user?.name,
      })
    },

    onMutate: async ({ order: purchase_order }) => {
      const queryKey = ['admin_purchase_orders', user]
      await queryClient.cancelQueries({ queryKey })

      const previousOrders = queryClient.getQueryData<PurchaseOrder[]>(queryKey)

      queryClient.setQueryData<PurchaseOrder[]>(queryKey, (old = []) =>
        old.map((order) =>
          order.id !== purchase_order.id
            ? order
            : {
                ...order,
                offer_status: order.offer_status === 'Resent' ? 'Rejected' : 'Resent',
                purchase_order_status: 'Rejected',
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
      return await apiRequest<SpotPrice>('POST', '/purchase_orders/update_scrap', {
        user_id: user.id,
        spot,
        scrap_percentage,
      })
    },
    onMutate: async ({ spot, scrap_percentage }) => {
      const queryKey = ['purchase_orders_metals', spot.purchase_order_id]
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

      return await apiRequest<SpotPrice>('POST', '/purchase_orders/reset_scrap', {
        user_id: user.id,
        spot,
      })
    },
    onMutate: async ({ spot }) => {
      const queryKey = ['purchase_orders_metals', spot.purchase_order_id]

      await queryClient.cancelQueries({ queryKey })

      const previousSpotPrices = queryClient.getQueryData<SpotPrice[]>(queryKey)
      const globalSpotPrices = queryClient.getQueryData<SpotPrice[]>(['spot_prices'])

      const globalScrapPercentage = globalSpotPrices?.find(
        (s) => s.type === spot.type
      )?.scrap_percentage

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
      return await apiRequest<SpotPrice>('POST', '/purchase_orders/update_spot', {
        user_id: user.id,
        spot,
        updated_spot,
      })
    },
    onMutate: async ({ spot, updated_spot }) => {
      const queryKey = ['purchase_orders_metals', spot.purchase_order_id]
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
    mutationFn: async ({
      spots,
      purchase_order_id,
    }: {
      spots: SpotPrice[]
      purchase_order_id: string
    }) => {
      if (!user?.id) throw new Error('User is not authenticated')
      return await apiRequest<SpotPrice[]>('POST', '/purchase_orders/lock_spots', {
        user_id: user.id,
        spots,
        purchase_order_id: purchase_order_id,
      })
    },
    onMutate: async ({ spots, purchase_order_id }) => {
      const queryKey = ['purchase_orders_metals', purchase_order_id]

      await queryClient.cancelQueries({ queryKey })
      const previousSpotPrices = queryClient.getQueryData<SpotPrice[]>(queryKey)

      queryClient.setQueryData<SpotPrice[]>(queryKey, (old = []) =>
        old.map((s) => {
          const incoming = spots.find((sp) => sp.id === s.id)
          return incoming ? { ...s, bid_spot: incoming.bid_spot } : s
        })
      )

      const orderQueryKey = ['admin_purchase_orders', user]
      const previousOrders = queryClient.getQueryData<PurchaseOrder[]>(queryKey)

      queryClient.setQueryData<PurchaseOrder[]>(queryKey, (old = []) =>
        old.map((order) =>
          order.id !== purchase_order_id
            ? order
            : {
                ...order,
                spots_locked: true,
              }
        )
      )

      return { previousSpotPrices, previousOrders, queryKey, orderQueryKey }
    },
    onError: (_err, _vars, context) => {
      if (context?.previousSpotPrices && context.queryKey) {
        queryClient.setQueryData(context.queryKey, context.previousSpotPrices)
      }
      if (context?.previousOrders && context.orderQueryKey) {
        queryClient.setQueryData(context.orderQueryKey, context.previousOrders)
      }
    },
    onSettled: (_data, _err, _vars, context) => {
      if (context?.queryKey) {
        queryClient.invalidateQueries({
          queryKey: context.queryKey,
          refetchType: 'active',
        })
      }
      if (context?.orderQueryKey) {
        queryClient.invalidateQueries({
          queryKey: context.orderQueryKey,
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
      return await apiRequest<SpotPrice[]>('POST', '/purchase_orders/unlock_spots', {
        user_id: user.id,
        purchase_order_id,
      })
    },
    onMutate: async ({ purchase_order_id }) => {
      const queryKey = ['purchase_orders_metals', purchase_order_id]
      await queryClient.cancelQueries({ queryKey })
      const previousSpotPrices = queryClient.getQueryData<SpotPrice[]>(queryKey)

      queryClient.setQueryData<SpotPrice[]>(queryKey, (old = []) =>
        old.map((s) => ({
          ...s,
          bid_spot: null as unknown as number,
        }))
      )

      const orderQueryKey = ['admin_purchase_orders', user]
      const previousOrders = queryClient.getQueryData<PurchaseOrder[]>(queryKey)

      queryClient.setQueryData<PurchaseOrder[]>(queryKey, (old = []) =>
        old.map((order) =>
          order.id !== purchase_order_id
            ? order
            : {
                ...order,
                spots_locked: false,
              }
        )
      )

      return { previousSpotPrices, previousOrders, queryKey, orderQueryKey }
    },
    onError: (_err, _vars, context) => {
      if (context?.previousSpotPrices && context.queryKey) {
        queryClient.setQueryData(context.queryKey, context.previousSpotPrices)
      }
      if (context?.previousOrders && context.orderQueryKey) {
        queryClient.setQueryData(context.orderQueryKey, context.previousOrders)
      }
    },
    onSettled: (_data, _err, _vars, context) => {
      if (context?.queryKey) {
        queryClient.invalidateQueries({
          queryKey: context.queryKey,
          refetchType: 'active',
        })
      }
      if (context?.orderQueryKey) {
        queryClient.invalidateQueries({
          queryKey: context.orderQueryKey,
          refetchType: 'active',
        })
      }
    },
  })
}

export const useSaveOrderItems = () => {
  const { user } = useGetSession()
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({
      ids,
      purchase_order_id,
    }: {
      ids: string[]
      purchase_order_id: string
    }) => {
      if (!user?.id) throw new Error('Not authenticated')
      return await apiRequest('POST', '/purchase_orders/save_order_items', {
        ids,
        purchase_order_id,
      })
    },
    onMutate: async ({ ids, purchase_order_id }) => {
      const queryKey = ['admin_purchase_orders', user]
      await queryClient.cancelQueries({ queryKey })

      const previousOrders = queryClient.getQueryData<PurchaseOrder[]>(queryKey)

      queryClient.setQueryData<PurchaseOrder[]>(queryKey, (old = []) =>
        old.map((order) =>
          order.id !== purchase_order_id
            ? order
            : {
                ...order,
                order_items: order.order_items.map((oi) =>
                  ids.includes(oi.id)
                    ? {
                        ...oi,
                        confirmed: true,
                      }
                    : oi
                ),
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

export const useResetOrderItem = () => {
  const { user } = useGetSession()
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({ id, purchase_order_id }: { id: string; purchase_order_id: string }) => {
      if (!user?.id) throw new Error('Not authenticated')
      return await apiRequest('POST', '/purchase_orders/reset_order_item', {
        id,
        purchase_order_id,
      })
    },
    onMutate: async ({ id, purchase_order_id }) => {
      const queryKey = ['admin_purchase_orders', user]
      await queryClient.cancelQueries({ queryKey })

      const previousOrders = queryClient.getQueryData<PurchaseOrder[]>(queryKey)

      queryClient.setQueryData<PurchaseOrder[]>(queryKey, (old = []) =>
        old.map((order) =>
          order.id !== purchase_order_id
            ? order
            : {
                ...order,
                order_items: order.order_items.map((oi) =>
                  oi.id === id ? { ...oi, confirmed: false } : oi
                ),
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
        queryClient.invalidateQueries({
          queryKey: context.queryKey,
          refetchType: 'active',
        })
      }
    },
  })
}

export const useUpdateOrderScrapItem = () => {
  const { user } = useGetSession()
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (item: PurchaseOrderItem) => {
      if (!user?.id) throw new Error('Not authenticated')
      return await apiRequest('POST', '/purchase_orders/update_scrap_item', { item })
    },
    onMutate: async (item) => {
      const queryKey = ['admin_purchase_orders', user]
      await queryClient.cancelQueries({ queryKey })

      const previousOrders = queryClient.getQueryData<PurchaseOrder[]>(queryKey)

      queryClient.setQueryData<PurchaseOrder[]>(queryKey, (old = []) =>
        old.map((order) =>
          order.id !== item.purchase_order_id
            ? order
            : {
                ...order,
                order_items: order.order_items.map((oi) =>
                  oi.id === item.id
                    ? {
                        ...oi,
                        scrap: {
                          ...oi.scrap!,
                          pre_melt: item.scrap!.pre_melt,
                          post_melt: item.scrap!.post_melt,
                          purity: item.scrap!.purity,
                        },
                      }
                    : oi
                ),
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

export const useDeleteOrderItems = () => {
  const { user } = useGetSession()
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({
      items,
      purchase_order_id,
    }: {
      items: PurchaseOrderItem[]
      purchase_order_id: string
    }) => {
      if (!user?.id) throw new Error('Not authenticated')
      return await apiRequest('POST', '/purchase_orders/delete_order_items', { items })
    },

    onMutate: async ({ items, purchase_order_id }) => {
      const queryKey = ['admin_purchase_orders', user]
      await queryClient.cancelQueries({ queryKey })

      const previousOrders = queryClient.getQueryData<PurchaseOrder[]>(queryKey)
      const ids = items.map((item) => item.id)

      queryClient.setQueryData<PurchaseOrder[]>(queryKey, (old = []) =>
        old.map((order) =>
          order.id !== purchase_order_id
            ? order
            : {
                ...order,
                order_items: order.order_items.filter((oi) => !ids.includes(oi.id)),
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

export const useAddNewOrderScrapItem = () => {
  const { user } = useGetSession()
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({
      item,
      purchase_order_id,
    }: {
      item: {
        metal: string
        pre_melt?: number
        purity?: number
        content?: number
        gross_unit?: string
      }
      purchase_order_id: string
    }) => {
      if (!user?.id) throw new Error('Not authenticated')
      return await apiRequest('POST', '/purchase_orders/create_order_item', {
        item,
        purchase_order_id,
      })
    },

    onMutate: async ({ item, purchase_order_id }) => {
      const queryKey = ['admin_purchase_orders', user]
      await queryClient.cancelQueries({ queryKey })

      const previousOrders = queryClient.getQueryData<PurchaseOrder[]>(queryKey)

      const optimisticId = `temp-${Date.now()}`
      const optimisticScrapId = `temp-scrap-${Date.now()}`

      const optimisticOrderItem: PurchaseOrderItem = {
        id: optimisticId,
        purchase_order_id,
        item_type: 'scrap',
        scrap: {
          id: optimisticScrapId,
          metal: item.metal,
          pre_melt: item.pre_melt ?? 1,
          purity: item.purity ?? 1,
          content: item.content ?? (item.pre_melt ?? 1) * (item.purity ?? 1),
          gross_unit: item.gross_unit ?? 't oz',
          name: `${item.metal} Item`,
        },
        quantity: 1,
        confirmed: false,
      }

      queryClient.setQueryData<PurchaseOrder[]>(queryKey, (old = []) =>
        old.map((order) =>
          order.id !== purchase_order_id
            ? order
            : {
                ...order,
                order_items: [optimisticOrderItem, ...order.order_items],
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
        queryClient.invalidateQueries({
          queryKey: context.queryKey,
          refetchType: 'active',
        })
      }
    },
  })
}

export const useUpdateOrderBullionItem = () => {
  const { user } = useGetSession()
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (item: PurchaseOrderItem) => {
      if (!user?.id) throw new Error('Not authenticated')
      return await apiRequest('POST', '/purchase_orders/update_bullion_item', { item })
    },
    onMutate: async (item) => {
      const queryKey = ['admin_purchase_orders', user]
      await queryClient.cancelQueries({ queryKey })

      const previousOrders = queryClient.getQueryData<PurchaseOrder[]>(queryKey)

      queryClient.setQueryData<PurchaseOrder[]>(queryKey, (old = []) =>
        old.map((order) =>
          order.id !== item.purchase_order_id
            ? order
            : {
                ...order,
                order_items: order.order_items.map((oi) =>
                  oi.id === item.id
                    ? {
                        ...oi,
                        quantity: item.quantity,
                        premium: item.premium,
                        product: {
                          ...oi.product!,
                        },
                      }
                    : oi
                ),
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

export const useAddNewOrderBullionItem = () => {
  const { user } = useGetSession()
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({
      item,
      purchase_order_id,
    }: {
      item: Product
      purchase_order_id: string
    }) => {
      if (!user?.id) throw new Error('Not authenticated')
      return await apiRequest('POST', '/purchase_orders/create_order_item', {
        item,
        purchase_order_id,
      })
    },

    onMutate: async ({ item, purchase_order_id }) => {
      const queryKey = ['admin_purchase_orders', user]
      await queryClient.cancelQueries({ queryKey })

      const previousOrders = queryClient.getQueryData<PurchaseOrder[]>(queryKey)

      const optimisticId = `temp-${Date.now()}`
      const optimisticScrapId = `temp-product-${Date.now()}`

      const optimisticOrderItem: PurchaseOrderItem = {
        id: optimisticId,
        purchase_order_id,
        item_type: 'product',
        product: item,
        quantity: 1,
        confirmed: false,
      }

      queryClient.setQueryData<PurchaseOrder[]>(queryKey, (old = []) =>
        old.map((order) =>
          order.id !== purchase_order_id
            ? order
            : {
                ...order,
                order_items: [optimisticOrderItem, ...order.order_items],
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
        queryClient.invalidateQueries({
          queryKey: context.queryKey,
          refetchType: 'active',
        })
      }
    },
  })
}

export const useAcceptOffer = () => {
  const { user } = useGetSession()
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({
      purchase_order,
      order_spots,
      spot_prices,
    }: {
      purchase_order: PurchaseOrder
      order_spots: SpotPrice[]
      spot_prices: SpotPrice[]
    }) => {
      if (!user?.id) throw new Error('User is not authenticated')
      return await apiRequest<{ purchaseOrder: PurchaseOrder; orderSpots: SpotPrice[] }>(
        'POST',
        '/purchase_orders/accept_offer',
        {
          user_id: user.id,
          order: purchase_order,
          order_spots,
          spot_prices,
        }
      )
    },

    onMutate: async ({ purchase_order, order_spots, spot_prices }) => {
      const queryKey = ['admin_purchase_orders', user]
      await queryClient.cancelQueries({ queryKey })

      const previousOrders = queryClient.getQueryData<PurchaseOrder[]>(queryKey)

      queryClient.setQueryData<PurchaseOrder[]>(queryKey, (old = []) =>
        old.map((order) =>
          order.id !== purchase_order.id
            ? order
            : {
                ...order,
                offer_status: 'Accepted',
                purchase_order_status: 'Accepted',
                spots_locked: true,
                order_items: purchase_order.order_items.map((item) => ({
                  ...item,
                  price: getPurchaseOrderItemPrice(item, spot_prices),
                })),
                total_price: getPurchaseOrderTotal(purchase_order, spot_prices, order_spots),
              }
        )
      )
      return { previousOrders, queryKey, spot_prices }
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

export const useRejectOffer = () => {
  const { user } = useGetSession()
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({
      purchase_order,
      offer_notes,
    }: {
      purchase_order: PurchaseOrder
      offer_notes: string
    }) => {
      if (!user?.id) throw new Error('User is not authenticated')
      return await apiRequest<PurchaseOrder>('POST', '/purchase_orders/reject_offer', {
        user_id: user.id,
        order: purchase_order,
        offer_notes,
      })
    },

    onMutate: async ({ purchase_order, offer_notes }) => {
      const queryKey = ['admin_purchase_orders', user]
      await queryClient.cancelQueries({ queryKey })

      const previousOrders = queryClient.getQueryData<PurchaseOrder[]>(queryKey)

      queryClient.setQueryData<PurchaseOrder[]>(queryKey, (old = []) =>
        old.map((order) =>
          order.id !== purchase_order.id
            ? order
            : {
                ...order,
                offer_status: 'Rejected',
                purchase_order_status: 'Rejected',
                offer_notes,
                num_rejections: order.num_rejections + 1,
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

export const useEditShippingCharge = () => {
  const { user } = useGetSession()
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({
      purchase_order,
      shipping_charge,
    }: {
      purchase_order: PurchaseOrder
      shipping_charge: number
    }) => {
      if (!user?.id) throw new Error('User is not authenticated')
      return await apiRequest<PurchaseOrder>('POST', '/purchase_orders/edit_shipping_charge', {
        order_id: purchase_order.id,
        shipping_charge,
      })
    },

    onMutate: async ({ purchase_order, shipping_charge }) => {
      const queryKey = ['admin_purchase_orders', user]
      await queryClient.cancelQueries({ queryKey })

      const previousOrders = queryClient.getQueryData<PurchaseOrder[]>(queryKey)

      queryClient.setQueryData<PurchaseOrder[]>(queryKey, (old = []) =>
        old.map((order) =>
          order.id !== purchase_order.id
            ? order
            : {
                ...order,
                shipment: {
                  ...order.shipment,
                  shipping_charge: shipping_charge,
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

    onSettled: (_data, _err, _vars, context) => {
      if (context?.queryKey) {
        queryClient.invalidateQueries({ queryKey: context.queryKey, refetchType: 'active' })
      }
    },
  })
}

export const useEditPayoutCharge = () => {
  const { user } = useGetSession()
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({
      purchase_order,
      payout_charge,
    }: {
      purchase_order: PurchaseOrder
      payout_charge: number
    }) => {
      if (!user?.id) throw new Error('User is not authenticated')
      return await apiRequest<PurchaseOrder>('POST', '/purchase_orders/edit_payout_charge', {
        order_id: purchase_order.id,
        payout_charge,
      })
    },

    onMutate: async ({ purchase_order, payout_charge }) => {
      const queryKey = ['admin_purchase_orders', user]
      await queryClient.cancelQueries({ queryKey })

      const previousOrders = queryClient.getQueryData<PurchaseOrder[]>(queryKey)

      queryClient.setQueryData<PurchaseOrder[]>(queryKey, (old = []) =>
        old.map((order) =>
          order.id !== purchase_order.id
            ? order
            : {
                ...order,
                payout: {
                  ...order.payout,
                  cost: payout_charge,
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

    onSettled: (_data, _err, _vars, context) => {
      if (context?.queryKey) {
        queryClient.invalidateQueries({ queryKey: context.queryKey, refetchType: 'active' })
      }
    },
  })
}

export const useEditPayoutMethod = () => {
  const { user } = useGetSession()
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({
      purchase_order,
      payout_method,
    }: {
      purchase_order: PurchaseOrder
      payout_method: string
    }) => {
      if (!user?.id) throw new Error('User is not authenticated')
      return await apiRequest<PurchaseOrder>('POST', '/purchase_orders/edit_payout_method', {
        order_id: purchase_order.id,
        method: payout_method,
      })
    },

    onMutate: async ({ purchase_order, payout_method }) => {
      const queryKey = ['admin_purchase_orders', user]
      await queryClient.cancelQueries({ queryKey })

      const previousOrders = queryClient.getQueryData<PurchaseOrder[]>(queryKey)

      queryClient.setQueryData<PurchaseOrder[]>(queryKey, (old = []) =>
        old.map((order) =>
          order.id !== purchase_order.id
            ? order
            : {
                ...order,
                payout: {
                  ...order.payout,
                  method: payout_method,
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

    onSettled: (_data, _err, _vars, context) => {
      if (context?.queryKey) {
        queryClient.invalidateQueries({ queryKey: context.queryKey, refetchType: 'active' })
      }
    },
  })
}

export const useAddFundsToAccount = () => {
  const { user } = useGetSession()
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({
      purchase_order,
      spots,
    }: {
      purchase_order: PurchaseOrder
      spots: SpotPrice[]
    }) => {
      if (!user?.id) throw new Error('User is not authenticated')
      return await apiRequest<PurchaseOrder>('POST', '/purchase_orders/add_funds_to_account', {
        order: purchase_order,
        spots,
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

export const usePurgeCancelled = () => {
  const { user } = useGetSession()
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async () => {
      if (!user?.id) throw new Error('User is not authenticated')
      return await apiRequest<PurchaseOrder>('DELETE', '/purchase_orders/purge_cancelled', {})
    },

    onSettled: () => {
      queryClient.invalidateQueries({
        queryKey: ['admin_purchase_orders', user],
        refetchType: 'active',
      })
    },
  })
}


export const usePurchaseOrderRefinerMetals = (purchase_order_id: string) => {
  const { user } = useGetSession()

  return useQuery<SpotPrice[]>({
    queryKey: ['purchase_order_refiner_metals', purchase_order_id],
    queryFn: async () => {
      if (!user?.id) return []
      return await apiRequest<SpotPrice[]>('POST', '/purchase_orders/get_purchase_order_refiner_metals', {
        user_id: user.id,
        purchase_order_id: purchase_order_id,
      })
    },
    enabled: !!user && !!purchase_order_id,
    refetchInterval: 60000,
  })
}

export const useUpdateOrderRefinerScrapPercentage = () => {
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
      return await apiRequest<SpotPrice>('POST', '/purchase_orders/update_refiner_scrap', {
        user_id: user.id,
        spot,
        scrap_percentage,
      })
    },
    onMutate: async ({ spot, scrap_percentage }) => {
      const queryKey = ['purchase_order_refiner_metals', spot.purchase_order_id]
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

export const useResetOrderRefinerScrapPercentage = () => {
  const { user } = useGetSession()
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({ spot }: { spot: SpotPrice }) => {
      if (!user?.id) throw new Error('User is not authenticated')

      return await apiRequest<SpotPrice>('POST', '/purchase_orders/reset_refiner_scrap', {
        user_id: user.id,
        spot,
      })
    },
    onMutate: async ({ spot }) => {
      const queryKey = ['purchase_order_refiner_metals', spot.purchase_order_id]

      await queryClient.cancelQueries({ queryKey })

      const previousSpotPrices = queryClient.getQueryData<SpotPrice[]>(queryKey)
      const globalSpotPrices = queryClient.getQueryData<SpotPrice[]>(['spot_prices'])

      const globalScrapPercentage = globalSpotPrices?.find(
        (s) => s.type === spot.type
      )?.scrap_percentage

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

export const useUpdateOrderRefinerSpotPrice = () => {
  const { user } = useGetSession()
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({ spot, updated_spot }: { spot: SpotPrice; updated_spot: number }) => {
      if (!user?.id) throw new Error('User is not authenticated')
      return await apiRequest<SpotPrice>('POST', '/purchase_orders/update_refiner_spot', {
        user_id: user.id,
        spot,
        updated_spot,
      })
    },
    onMutate: async ({ spot, updated_spot }) => {
      const queryKey = ['purchase_order_refiner_metals', spot.purchase_order_id]
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