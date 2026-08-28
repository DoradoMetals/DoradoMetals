import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { apiRequest } from '@/shared/queries/axios'
import { PurchaseOrder, PurchaseOrderCheckout } from '@/features/orders/purchaseOrders/types'
import { toAddressSnapshot } from '@/features/orders/addressSnapshot'
import { useGetSession } from '@/features/auth/queries'

export const usePurchaseOrders = () => {
  const { user } = useGetSession()

  return useQuery<PurchaseOrder[]>({
    queryKey: ['purchase_orders', user?.id],
    queryFn: async () => {
      if (!user?.id) return []
      // The unified list. user_id pins the row scope to the caller even when
      // the caller is an admin (whom GET /orders otherwise serves ALL rows) -
      // the same self-scope the legacy route's param gave this list.
      return await apiRequest<PurchaseOrder[]>('GET', '/orders', undefined, {
        direction: 'purchase',
        user_id: user.id,
      })
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
      // The body carries the order's address as the SNAPSHOT the wire speaks,
      // built at this edge from the checkout's picked pair.
      return await apiRequest<PurchaseOrder>('POST', '/purchase_orders/create_purchase_order', {
        user_id: user.id,
        purchase_order: {
          ...purchase_order,
          address: toAddressSnapshot(purchase_order.address, purchase_order.user_address),
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
    // THE CONFIRMATION EMAIL IS NOT SENT FROM HERE ANY MORE (D91). It was an
    // await in this onSuccess, POSTing the whole composed order plus the spot
    // feed, the package and the payout method to
    // /emails/purchase_order_created, wrapped in a try/catch that only
    // console.error'd - so the content of a customer's confirmation came from
    // the browser (ruling 10), and closing the tab meant no email, no record
    // and nobody told. The server sends it at creation now, after the commit,
    // rendered from its own read; the route is deleted.
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
