import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { apiRequest } from '@/shared/queries/axios'
import { PurchaseOrder, PurchaseOrderItem } from '@/features/orders/purchaseOrders/types'
import { SpotPrice } from '@/features/spots/types'
import { OrderSpot, OrderSpotWire, orderSpotFromWire, orderSpotToWire } from '@/features/orders/orderSpots'
import { toOrderProduct } from '@/features/orders/orderProducts'
import { Product } from '@/features/products/types'
import { PayoutDetails } from '@/features/payouts/types'
import getPurchaseOrderItemPrice from '@/features/orders/purchaseOrders/utils/getPurchaseOrderItemPrice'
import getPurchaseOrderTotal from '@/features/orders/purchaseOrders/utils/purchaseOrderTotal'
import { useGetSession } from '@/features/auth/queries'

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

export const useAcceptOrder = () => {
  const queryClient = useQueryClient()
  const { user } = useGetSession()

  return useMutation({
    mutationFn: async ({
      purchase_order,
      order_spots,
      spot_prices,
    }: {
      purchase_order: PurchaseOrder
      order_spots: OrderSpot[]
      spot_prices: SpotPrice[]
    }) => {
      if (!user?.id) throw new Error('Not authenticated')
      // The API prices the order off these rows and reads the orders wire's
      // legacy names; both arrays go down at the edge.
      return await apiRequest('POST', '/purchase_orders/accept_order', {
        purchase_order,
        order_spots: order_spots.map(orderSpotToWire),
        spot_prices: spot_prices.map(orderSpotToWire),
      })
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ['admin_purchase_orders', user] })
    },
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

export const useUpdateOrderSpotPrice = () => {
  const { user } = useGetSession()
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({ spot, updated_spot }: { spot: OrderSpot; updated_spot: number }) => {
      if (!user?.id) throw new Error('User is not authenticated')
      return await apiRequest<OrderSpotWire>('POST', '/purchase_orders/update_spot', {
        user_id: user.id,
        spot: orderSpotToWire(spot),
        updated_spot,
      })
    },
    onMutate: async ({ spot, updated_spot }) => {
      const queryKey = ['purchase_orders_metals', spot.purchase_order_id]
      await queryClient.cancelQueries({ queryKey })
      const previousSpotPrices = queryClient.getQueryData<OrderSpot[]>(queryKey)

      queryClient.setQueryData<OrderSpot[]>(queryKey, (old = []) =>
        old.map((s) => (s.id === spot.id ? { ...s, bid: updated_spot } : s))
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
      return await apiRequest<OrderSpotWire[]>('POST', '/purchase_orders/lock_spots', {
        user_id: user.id,
        spots: spots.map(orderSpotToWire),
        purchase_order_id,
      })
    },
    onMutate: async ({ spots, purchase_order_id }) => {
      const metalsKey = ['purchase_orders_metals', purchase_order_id]

      await queryClient.cancelQueries({ queryKey: metalsKey })
      const previousSpotPrices = queryClient.getQueryData<OrderSpot[]>(metalsKey)

      queryClient.setQueryData<OrderSpot[]>(metalsKey, (old = []) =>
        old.map((s) => {
          const incoming = spots.find((sp) => sp.id === s.id)
          return incoming ? { ...s, bid: incoming.bid } : s
        })
      )

      const ordersKey = ['admin_purchase_orders', user]
      const previousOrders = queryClient.getQueryData<PurchaseOrder[]>(ordersKey)

      queryClient.setQueryData<PurchaseOrder[]>(ordersKey, (old = []) =>
        old.map((order) =>
          order.id !== purchase_order_id
            ? order
            : {
                ...order,
                spots_locked: true,
              }
        )
      )

      return { previousSpotPrices, previousOrders, metalsKey, ordersKey }
    },
    onError: (_err, _vars, context) => {
      if (context?.previousSpotPrices && context.metalsKey) {
        queryClient.setQueryData(context.metalsKey, context.previousSpotPrices)
      }
      if (context?.previousOrders && context.ordersKey) {
        queryClient.setQueryData(context.ordersKey, context.previousOrders)
      }
    },
    onSettled: (_data, _err, _vars, context) => {
      if (context?.metalsKey) {
        queryClient.invalidateQueries({
          queryKey: context.metalsKey,
          refetchType: 'active',
        })
      }
      if (context?.ordersKey) {
        queryClient.invalidateQueries({
          queryKey: context.ordersKey,
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
      const previousSpotPrices = queryClient.getQueryData<OrderSpot[]>(queryKey)

      queryClient.setQueryData<OrderSpot[]>(queryKey, (old = []) =>
        old.map((s) => ({
          ...s,
          bid: null,
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
                          purity_actual: item.scrap!.purity_actual,
                          post_melt_actual: item.scrap!.post_melt_actual,
                        },
                        premium: oi.premium,
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
        bid_premium?: number
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
          bid_premium: item.bid_premium ?? 0.75,
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
        // The optimistic entry is read by UI that speaks the orders wire.
        product: toOrderProduct(item),
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

  return useQuery<OrderSpot[]>({
    queryKey: ['purchase_order_refiner_metals', purchase_order_id],
    queryFn: async () => {
      if (!user?.id) return []
      const rows = await apiRequest<OrderSpotWire[]>(
        'POST',
        '/purchase_orders/get_purchase_order_refiner_metals',
        {
          user_id: user.id,
          purchase_order_id: purchase_order_id,
        }
      )
      return rows.map(orderSpotFromWire)
    },
    enabled: !!user && !!purchase_order_id,
    refetchInterval: 60000,
  })
}

export const useUpdateOrderRefinerSpotPrice = () => {
  const { user } = useGetSession()
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({ spot, updated_spot }: { spot: OrderSpot; updated_spot: number }) => {
      if (!user?.id) throw new Error('User is not authenticated')
      return await apiRequest<OrderSpotWire>('POST', '/purchase_orders/update_refiner_spot', {
        user_id: user.id,
        spot: orderSpotToWire(spot),
        updated_spot,
      })
    },
    onMutate: async ({ spot, updated_spot }) => {
      const queryKey = ['purchase_order_refiner_metals', spot.purchase_order_id]
      await queryClient.cancelQueries({ queryKey })
      const previousSpotPrices = queryClient.getQueryData<OrderSpot[]>(queryKey)

      queryClient.setQueryData<OrderSpot[]>(queryKey, (old = []) =>
        old.map((s) => (s.id === spot.id ? { ...s, bid: updated_spot } : s))
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

export const useUpdateRefinerPremium = () => {
  const { user } = useGetSession()
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({
      purchase_order_id,
      item_id,
      refiner_premium,
    }: {
      purchase_order_id: string
      item_id: string
      refiner_premium: number | null
    }) => {
      if (!user?.id) throw new Error('User is not authenticated')
      return await apiRequest('POST', '/purchase_orders/update_refiner_premium', {
        purchase_order_id,
        item_id,
        refiner_premium,
      })
    },

    onMutate: async ({ purchase_order_id, item_id, refiner_premium }) => {
      const queryKey = ['admin_purchase_orders', user]
      await queryClient.cancelQueries({ queryKey })

      const previousOrders = queryClient.getQueryData<PurchaseOrder[]>(queryKey)

      queryClient.setQueryData<PurchaseOrder[]>(queryKey, (old = []) =>
        old.map((order) => {
          if (order.id !== purchase_order_id) return order

          const items = order.order_items.map(
            (oi): PurchaseOrderItem =>
              oi.id === item_id ? ({ ...oi, refiner_premium } as PurchaseOrderItem) : oi
          )

          return { ...order, order_items: items }
        })
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

export const useUpdateShippingActual = () => {
  const { user } = useGetSession()
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({
      purchase_order_id,
      shipping_fee_actual,
    }: {
      purchase_order_id: string
      shipping_fee_actual: number | null
    }) => {
      if (!user?.id) throw new Error('User is not authenticated')
      return await apiRequest('POST', '/purchase_orders/update_shipping_actual', {
        purchase_order_id,
        shipping_fee_actual,
      })
    },

    onMutate: async ({ purchase_order_id, shipping_fee_actual }) => {
      const queryKey = ['admin_purchase_orders', user]
      await queryClient.cancelQueries({ queryKey })

      const previousOrders =
        queryClient.getQueryData<PurchaseOrder[]>(queryKey) ?? []

      queryClient.setQueryData<PurchaseOrder[]>(queryKey, (old) => {
        const list = old ?? []
        const next = list.map((order): PurchaseOrder =>
          order.id !== purchase_order_id
            ? order
            : { ...order, shipping_fee_actual } as PurchaseOrder
        )
        return next
      })

      return { previousOrders, queryKey }
    },

    onError: (_err, _vars, context) => {
      if (context?.queryKey) {
        queryClient.setQueryData<PurchaseOrder[]>(
          context.queryKey,
          context.previousOrders ?? []
        )
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

export const useUpdateRefinerFee = () => {
  const { user } = useGetSession()
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({
      purchase_order_id,
      refiner_fee,
    }: {
      purchase_order_id: string
      refiner_fee: number | null
    }) => {
      if (!user?.id) throw new Error('User is not authenticated')
      return await apiRequest('POST', '/purchase_orders/update_refiner_fee', {
        purchase_order_id,
        refiner_fee,
      })
    },

    onMutate: async ({ purchase_order_id, refiner_fee }) => {
      const queryKey = ['admin_purchase_orders', user]
      await queryClient.cancelQueries({ queryKey })

      const previousOrders =
        queryClient.getQueryData<PurchaseOrder[]>(queryKey) ?? []

      queryClient.setQueryData<PurchaseOrder[]>(queryKey, (old) => {
        const list = old ?? []
        const next = list.map((order): PurchaseOrder =>
          order.id !== purchase_order_id
            ? order
            : { ...order, refiner_fee } as PurchaseOrder
        )
        return next
      })

      return { previousOrders, queryKey }
    },

    onError: (_err, _vars, context) => {
      if (context?.queryKey) {
        queryClient.setQueryData<PurchaseOrder[]>(
          context.queryKey,
          context.previousOrders ?? []
        )
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

export const useUpdatePoolOzDeducted = () => {
  const { user } = useGetSession()
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({
      purchase_order_id,
      pool_oz_deducted,
    }: {
      purchase_order_id: string
      pool_oz_deducted: number
    }) => {
      if (!user?.id) throw new Error('User is not authenticated')
      return await apiRequest('POST', '/purchase_orders/update_pool_oz_deducted', {
        purchase_order_id,
        pool_oz_deducted,
      })
    },

    onMutate: async ({ purchase_order_id, pool_oz_deducted }) => {
      const queryKey = ['admin_purchase_orders', user]
      await queryClient.cancelQueries({ queryKey })

      const previousOrders =
        queryClient.getQueryData<PurchaseOrder[]>(queryKey) ?? []

      queryClient.setQueryData<PurchaseOrder[]>(queryKey, (old) => {
        const list = old ?? []
        const next = list.map((order): PurchaseOrder =>
          order.id !== purchase_order_id
            ? order
            : { ...order, pool_oz_deducted } as PurchaseOrder
        )
        return next
      })

      return { previousOrders, queryKey }
    },

    onError: (_err, _vars, context) => {
      if (context?.queryKey) {
        queryClient.setQueryData<PurchaseOrder[]>(
          context.queryKey,
          context.previousOrders ?? []
        )
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

export const useUpdatePoolRemediation = () => {
  const { user } = useGetSession()
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({
      purchase_order_id,
      pool_remediation,
    }: {
      purchase_order_id: string
      pool_remediation: number
    }) => {
      if (!user?.id) throw new Error('User is not authenticated')
      return await apiRequest('POST', '/purchase_orders/update_pool_remediation', {
        purchase_order_id,
        pool_remediation,
      })
    },

    onMutate: async ({ purchase_order_id, pool_remediation }) => {
      const queryKey = ['admin_purchase_orders', user]
      await queryClient.cancelQueries({ queryKey })

      const previousOrders =
        queryClient.getQueryData<PurchaseOrder[]>(queryKey) ?? []

      queryClient.setQueryData<PurchaseOrder[]>(queryKey, (old) => {
        const list = old ?? []
        const next = list.map((order): PurchaseOrder =>
          order.id !== purchase_order_id
            ? order
            : { ...order, pool_remediation } as PurchaseOrder
        )
        return next
      })

      return { previousOrders, queryKey }
    },

    onError: (_err, _vars, context) => {
      if (context?.queryKey) {
        queryClient.setQueryData<PurchaseOrder[]>(
          context.queryKey,
          context.previousOrders ?? []
        )
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



// Full bank details for one payout. These are deliberately absent from the
// order payloads - the orders list would otherwise carry every customer's
// routing and account number - so they are fetched per order, on demand, only
// where an admin actually needs them to execute a transfer.
export const usePayoutDetails = (order_id: string | undefined, enabled: boolean) => {
  return useQuery<PayoutDetails>({
    queryKey: ['payout_details', order_id],
    queryFn: async () =>
      await apiRequest<PayoutDetails>('POST', '/purchase_orders/get_payout_details', {
        order_id,
      }),
    enabled: !!order_id && enabled,
    staleTime: 0,
    gcTime: 0,
  })
}
