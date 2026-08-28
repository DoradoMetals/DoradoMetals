import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { apiRequest } from '@/shared/queries/axios'
import {
  PurchaseOrder,
  PurchaseOrderCheckout,
  PurchaseOrderReturnShipment,
} from '@/features/orders/purchaseOrders/types'
import { SpotPrice } from '@/features/spots/types'
import { OrderSpot, OrderSpotWire, orderSpotFromWire } from '@/features/orders/orderSpots'
import { orderAddressToWire } from '@/features/orders/orderAddresses'
import getPurchaseOrderItemPrice from '@/features/orders/purchaseOrders/utils/getPurchaseOrderItemPrice'
import getPurchaseOrderTotal from '@/features/orders/purchaseOrders/utils/purchaseOrderTotal'
import { payoutOptions } from '@/features/payouts/types'
import { packageOptions } from '@/features/packaging/types'
import { useGetSession } from '@/features/auth/queries'
import { useSpotPrices } from '@/features/spots/queries'

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
      // The API reads the body address FLAT - address.name becomes the FedEx
      // label's personName - so the picked (nested) address goes down at the
      // edge. Dies with the orders/checkout conversion.
      return await apiRequest<PurchaseOrder>('POST', '/purchase_orders/create_purchase_order', {
        user_id: user.id,
        purchase_order: {
          ...purchase_order,
          address: orderAddressToWire(purchase_order.address, purchase_order.user_address),
        },
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

  return useQuery<OrderSpot[]>({
    queryKey: ['purchase_orders_metals', purchase_order_id],
    queryFn: async () => {
      if (!user?.id) return []
      // The orders wire still speaks legacy names; map up at the edge so
      // everything downstream reads the converted shape.
      const rows = await apiRequest<OrderSpotWire[]>('POST', '/purchase_orders/get_purchase_order_metals', {
        user_id: user.id,
        purchase_order_id: purchase_order_id,
      })
      return rows.map(orderSpotFromWire)
    },
    enabled: !!user && !!purchase_order_id,
    refetchInterval: 60000,
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
      // Same flat-body read as create: the return label's personName is
      // return_shipment.address.name on the API side.
      return await apiRequest<PurchaseOrder>('POST', '/purchase_orders/cancel_order', {
        user_id: user.id,
        order: purchase_order,
        return_shipment: {
          ...return_shipment,
          address: orderAddressToWire(return_shipment.address, return_shipment.user_address),
        },
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
                purchase_order_status: 'Cancelled',
                spots_locked: false,
              }
        )
      )

      const metalsQueryKey = ['purchase_orders_metals', purchase_order.id]
      const previousSpotPrices = queryClient.getQueryData<OrderSpot[]>(metalsQueryKey)

      queryClient.setQueryData<SpotPrice[]>(queryKey, (old = []) =>
        old.map((s) => ({
          ...s,
          bid: null,
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
