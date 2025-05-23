import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { apiRequest } from '@/utils/axiosInstance'
import { useGetSession } from './useAuth'
import {
  PurchaseOrder,
  PurchaseOrderCheckout,
  PurchaseOrderReturnShipment,
} from '@/types/purchase-order'
import { SpotPrice } from '@/types/metal'
import getPurchaseOrderItemPrice from '@/utils/getPurchaseOrderItemPrice'
import getPurchaseOrderTotal from '@/utils/purchaseOrderTotal'
import { payoutOptions } from '@/types/payout'

export const usePurchaseOrders = () => {
  const { user } = useGetSession()

  return useQuery<PurchaseOrder[]>({
    queryKey: ['purchase_orders', user?.id],
    queryFn: async () => {
      if (!user?.id) return []
      return await apiRequest<PurchaseOrder[]>(
        'GET',
        '/purchase_orders/get_purchase_orders',
        undefined,
        {
          user_id: user.id,
        }
      )
    },
    enabled: !!user,
    refetchInterval: 10000,
  })
}

export const useCreatePurchaseOrder = () => {
  const { user } = useGetSession()
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (purchase_order: PurchaseOrderCheckout) => {
      if (!user?.id) throw new Error('User is not authenticated')
      return await apiRequest<PurchaseOrderCheckout>(
        'POST',
        '/purchase_orders/create_purchase_order',
        {
          user_id: user.id,
          purchase_order: purchase_order,
        }
      )
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ['purchase_orders', user], refetchType: 'active' })
    },
  })
}

export const usePurchaseOrderMetals = (purchase_order_id: string) => {
  const { user } = useGetSession()

  return useQuery<SpotPrice[]>({
    queryKey: ['purchase_orders_metals', purchase_order_id],
    queryFn: async () => {
      if (!user?.id) return []
      return await apiRequest<SpotPrice[]>('POST', '/purchase_orders/get_purchase_order_metals', {
        user_id: user.id,
        purchase_order_id: purchase_order_id,
      })
    },
    enabled: !!user && !!purchase_order_id,
    refetchInterval: 60000,
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
      return await apiRequest<PurchaseOrder>('POST', '/purchase_orders/accept_offer', {
        user_id: user.id,
        order: purchase_order,
        order_spots,
        spot_prices,
      })
    },

    onMutate: async ({ purchase_order, order_spots, spot_prices }) => {
      const queryKey = ['purchase_orders', user?.id]
      await queryClient.cancelQueries({ queryKey })

      const previousOrders = queryClient.getQueryData<PurchaseOrder[]>(queryKey)

      const payoutMethod = payoutOptions.find((p) => p.method === purchase_order.payout?.method)
      const payoutFee = payoutMethod?.cost ?? 0

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
                total_price: getPurchaseOrderTotal(
                  purchase_order,
                  spot_prices,
                  order_spots,
                  payoutFee
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
      const queryKey = ['purchase_orders', user?.id]
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

export const useCancelOrder = () => {
  const { user } = useGetSession()
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({
      purchase_order,
      return_shipment,
    }: {
      purchase_order: PurchaseOrder
      return_shipment: PurchaseOrderReturnShipment
    }) => {
      if (!user?.id) throw new Error('User is not authenticated')
      return await apiRequest<PurchaseOrder>('POST', '/purchase_orders/cancel_order', {
        user_id: user.id,
        order: purchase_order,
        return_shipment: return_shipment,
      })
    },

    onMutate: async ({ purchase_order }) => {
      const queryKey = ['purchase_orders', user?.id]
      await queryClient.cancelQueries({ queryKey })

      const previousOrders = queryClient.getQueryData<PurchaseOrder[]>(queryKey)

      queryClient.setQueryData<PurchaseOrder[]>(queryKey, (old = []) =>
        old.map((order) =>
          order.id !== purchase_order.id
            ? order
            : {
                ...order,
                offer_status: 'Cancelled',
                purchase_order_status: 'Cancelled',
                spots_locked: false,
              }
        )
      )

      const metalsQueryKey = ['purchase_orders_metals', purchase_order.id]
      const previousSpotPrices = queryClient.getQueryData<SpotPrice[]>(metalsQueryKey)

      queryClient.setQueryData<SpotPrice[]>(queryKey, (old = []) =>
        old.map((s) => ({
          ...s,
          bid_spot: null as unknown as number,
        }))
      )

      return { previousSpotPrices, previousOrders, queryKey, metalsQueryKey }
    },

    onError: (_err, _vars, context) => {
      if (context?.previousSpotPrices && context.metalsQueryKey) {
        queryClient.setQueryData(context.queryKey, context.previousSpotPrices)
      }
      if (context?.previousOrders && context.queryKey) {
        queryClient.setQueryData(context.queryKey, context.previousOrders)
      }
    },
    onSettled: (_data, _err, _vars, context) => {
      if (context?.metalsQueryKey) {
        queryClient.invalidateQueries({
          queryKey: context.queryKey,
          refetchType: 'active',
        })
      }
      if (context?.queryKey) {
        queryClient.invalidateQueries({
          queryKey: context.queryKey,
          refetchType: 'active',
        })
      }
    },
  })
}

export const useUpdateOfferNotes = () => {
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
      return await apiRequest<PurchaseOrder>('POST', '/purchase_orders/update_offer_notes', {
        user_id: user.id,
        order: purchase_order,
        offer_notes,
      })
    },

    onMutate: async ({ purchase_order, offer_notes }) => {
      const queryKey = ['purchase_orders', user?.id]
      await queryClient.cancelQueries({ queryKey })

      const previousOrders = queryClient.getQueryData<PurchaseOrder[]>(queryKey)

      queryClient.setQueryData<PurchaseOrder[]>(queryKey, (old = []) =>
        old.map((order) =>
          order.id !== purchase_order.id
            ? order
            : {
                ...order,
                offer_notes,
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
