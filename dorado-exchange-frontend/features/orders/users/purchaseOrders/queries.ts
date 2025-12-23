import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { apiRequest } from '@/utils/axiosInstance'
import { useGetSession } from '../../features/auth/queries'
import {
  PurchaseOrder,
  PurchaseOrderCheckout,
  PurchaseOrderReturnShipment,
} from '@/types/purchase-order'
import { SpotPrice } from '@/features/spots/types'
import getPurchaseOrderItemPrice from '@/utils/purchaseOrders/getPurchaseOrderItemPrice'
import getPurchaseOrderTotal from '@/utils/purchaseOrders/purchaseOrderTotal'
import { payoutOptions } from '@/types/payout'
import { useSpotPrices } from './useSpotPrices'
import { packageOptions } from '@/types/packaging'

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
  const { data: spotPrices = [] } = useSpotPrices()

  return useMutation({
    mutationFn: async (purchase_order: PurchaseOrderCheckout) => {
      if (!user?.id) throw new Error('User is not authenticated')
      return await apiRequest<PurchaseOrder>('POST', '/purchase_orders/create_purchase_order', {
        user_id: user.id,
        purchase_order: purchase_order,
        user: user,
      })
    },
    onSettled: () => {
      queryClient.invalidateQueries({
        queryKey: ['purchase_orders', user?.id],
        refetchType: 'active',
      })
    },
    onSuccess: async (purchaseOrder: PurchaseOrder) => {
      const packageDetails =
        packageOptions.find((pkg) => pkg.label === purchaseOrder.shipment.package) ??
        packageOptions[0]
      const payoutDetails =
        payoutOptions.find((payout) => payout.method === purchaseOrder.payout.method) ??
        payoutOptions[0]
      try {
        await apiRequest('POST', '/emails/purchase_order_created', {
          purchaseOrder: purchaseOrder,
          spotPrices: spotPrices,
          packageDetails: packageDetails,
          payoutDetails: payoutDetails,
        })
      } catch (err) {
        console.error('Failed to send confirmation email:', err)
      }
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
  const { user, refetch: refetchSession } = useGetSession()

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
      const queryKey = ['purchase_orders', user?.id]
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
      return { purchase_order, order_spots, spot_prices, previousOrders, queryKey }
    },

    onError: (_err, _vars, context) => {
      if (context?.previousOrders && context.queryKey) {
        queryClient.setQueryData(context.queryKey, context.previousOrders)
      }
    },
    onSettled: (_data, _err, _vars, context) => {
      if (context?.queryKey) {
        queryClient.invalidateQueries({ queryKey: context.queryKey, refetchType: 'active' })
        refetchSession()
      }
    },
    onSuccess: async (data, context) => {
      await apiRequest('POST', '/purchase_orders/purchase_order_offer_accepted', {
        order: data.purchaseOrder,
        order_spots: data.orderSpots,
        spot_prices: context.spot_prices,
      })
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

export const useSetReviewCreated = () => {
  const { user } = useGetSession()
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({ purchase_order }: { purchase_order: PurchaseOrder }) => {
      if (!user?.id) throw new Error('User is not authenticated')
      return await apiRequest<PurchaseOrder>('POST', '/purchase_orders/create_review', {
        user_id: user.id,
        order: purchase_order,
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
